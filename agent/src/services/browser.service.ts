import fs from 'fs';
import path from 'path';
import { type ExecService } from './exec.service';

function isExecutable(file: string): boolean {
	try {
		fs.accessSync(file, fs.constants.X_OK);

		return true;
	} catch {
		return false;
	}
}

// Needs root: it installs the system libraries Chromium links against, which is
// the one thing a user-level install cannot do for itself. `sudo` resets PATH,
// and the node this agent runs with lives in its own toolchain directory rather
// than on the system path — so a bare `sudo npx …` is a command that is not found.
// The directory the agent's own `npx` is in travels with the command instead.
export function installDepsCommand(opts?: {
	pathEnv?: string;
	executable?: (file: string) => boolean;
}): string {
	const executable = opts?.executable ?? isExecutable;
	const dir = (opts?.pathEnv ?? process.env.PATH ?? '')
		.split(path.delimiter)
		.find((entry) => entry !== '' && executable(path.join(entry, 'npx')));

	return dir === undefined
		? 'sudo npx -y playwright install-deps chromium'
		: `sudo env "PATH=${dir}:$PATH" npx -y playwright install-deps chromium`;
}

const LAUNCH_TIMEOUT_MS = 20_000;
const SEARCH_DEPTH = 3;

// The headless shell first: it is what a headless launch prefers, and a machine
// that has both is driven through it. The directory layout inside a build has
// changed between Playwright releases, so the executable is found by name rather
// than at a fixed path.
const BUILDS = [
	{ prefix: 'chromium_headless_shell-', names: ['headless_shell', 'chrome-headless-shell'] },
	{ prefix: 'chromium-', names: ['chrome', 'Chromium'] }
];

function revision(entry: string): number {
	return Number(/-(\d+)$/.exec(entry)?.[1] ?? 0);
}

function isExecutableFile(file: string): boolean {
	try {
		const stat = fs.statSync(file);

		return stat.isFile() && (stat.mode & 0o111) !== 0;
	} catch {
		return false;
	}
}

function findByName(dir: string, names: string[], depth: number): string | null {
	let entries: fs.Dirent[];

	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return null;
	}

	const found = entries
		.filter((entry) => names.includes(entry.name))
		.map((entry) => path.join(dir, entry.name))
		.find(isExecutableFile);

	if (found !== undefined || depth === 0) {
		return found ?? null;
	}

	for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
		const nested = findByName(path.join(dir, entry.name), names, depth - 1);

		if (nested !== null) {
			return nested;
		}
	}

	return null;
}

export function findBrowserExecutable(cachePath: string): string | null {
	let entries: string[];

	try {
		entries = fs.readdirSync(cachePath);
	} catch {
		return null;
	}

	for (const build of BUILDS) {
		const newestFirst = entries
			.filter((entry) => entry.startsWith(build.prefix))
			.sort((a, b) => revision(b) - revision(a));

		for (const entry of newestFirst) {
			const executable = findByName(path.join(cachePath, entry), build.names, SEARCH_DEPTH);

			if (executable !== null) {
				return executable;
			}
		}
	}

	return null;
}

// The dynamic loader's own wording, which names the one library it gave up on.
export function missingLibrary(output: string): string | null {
	return /error while loading shared libraries: ([^:\s]+)/.exec(output)?.[1] ?? null;
}

export function lddMissing(output: string): string[] {
	return [...new Set([...output.matchAll(/^\s*(\S+) => not found/gm)].map((match) => match[1]))];
}

// Playwright refuses to launch until `ldd` finds every library of every binary
// in the build, including the ones Chromium only loads later — so a build that
// starts for `--dump-dom` can still be one the browser tool will not open.
async function unresolvedLibraries(deps: { exec: ExecService; executable: string }): Promise<string[]> {
	const dir = path.dirname(deps.executable);
	let libraries: string[];

	try {
		libraries = fs.readdirSync(dir).filter((name) => name.endsWith('.so')).map((name) => path.join(dir, name));
	} catch {
		libraries = [];
	}

	const linked = await deps.exec.run('ldd', [deps.executable, ...libraries], { timeoutMs: LAUNCH_TIMEOUT_MS });

	return lddMissing(linked.stdout);
}

// A build in the cache is not a browser that starts. A fresh Ubuntu lacks the
// libraries Chromium links against, and the only way to find that out is to
// launch it — which is what a session would otherwise discover an hour into a
// bullet, as every browser tool failing.
export async function launchBrowser(deps: {
	exec: ExecService;
	cachePath: string | null;
	platform?: NodeJS.Platform;
}): Promise<{ ok: boolean; detail: string; missingLibrary: string | null }> {
	if (deps.cachePath === null) {
		return {
			ok: true,
			detail: 'PLAYWRIGHT_BROWSERS_PATH=0 — browsers live beside the package, so there is nothing here to launch',
			missingLibrary: null
		};
	}

	const executable = findBrowserExecutable(deps.cachePath);

	if (executable === null) {
		return {
			ok: false,
			detail: `no chromium build in ${deps.cachePath} — run \`npx playwright install chromium\`, or no session can drive a browser`,
			missingLibrary: null
		};
	}

	if ((deps.platform ?? process.platform) === 'linux') {
		const missing = await unresolvedLibraries({ exec: deps.exec, executable });

		if (missing.length > 0) {
			return {
				ok: false,
				detail: `chromium cannot start: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing — install the system libraries it needs with \`${installDepsCommand()}\``,
				missingLibrary: missing[0]
			};
		}
	}

	const launched = await deps.exec.run(
		executable,
		['--headless', '--no-sandbox', '--dump-dom', 'about:blank'],
		{ timeoutMs: LAUNCH_TIMEOUT_MS }
	);

	if (launched.ok) {
		return { ok: true, detail: `chromium launches headless from ${executable}`, missingLibrary: null };
	}

	const library = missingLibrary(`${launched.stderr}\n${launched.stdout}\n${launched.reason}`);

	return {
		ok: false,
		detail:
			library === null
				? `chromium in ${deps.cachePath} did not launch: ${launched.reason}`
				: `chromium cannot start: ${library} is missing — install the system libraries it needs with \`${installDepsCommand()}\``,
		missingLibrary: library
	};
}
