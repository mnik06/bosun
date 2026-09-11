import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { type EnvService } from './env.service';

export const MCP_CONFIG_FILENAME = 'mcp.json';

// Our own server is assembled per session and carries the loopback bearer token.
// A user server under the same key would shadow it and take the planning tools
// with it, so the name is refused rather than merged over.
export const RESERVED_SERVER_NAME = 'bosun';

// Bosun's opinion about what a session should have, merged underneath the user's
// file so an entry of the same name in ~/.bosun/mcp.json wins. Setting one to
// `null` there is how a machine opts out of a default it cannot use — a box with
// no chromium installed, say.
export const DEFAULT_SERVERS: Record<string, unknown> = {
	playwright: {
		type: 'stdio',
		command: 'npx',
		// `--browser chromium` and not the default, which is the `chrome` channel —
		// a real Google Chrome install at a system path. A machine is a headless box
		// that has run `npx playwright install chromium`, so the default resolved to
		// an executable that was not there and every browser tool failed at the
		// point a bullet tried to verify something. `--headless` for the same
		// reason: the server runs headed unless told otherwise, and there is no
		// display on a VPS.
		args: ['-y', '@playwright/mcp@latest', '--browser', 'chromium', '--headless']
	},
	context7: {
		type: 'stdio',
		command: 'npx',
		args: ['-y', '@upstash/context7-mcp']
	}
};

const McpConfigFileSchema = z.object({
	mcpServers: z.record(z.string(), z.unknown())
});

// `${VAR}` and `${VAR:-default}`, matching what Claude Code does for `.mcp.json`.
// Expansion happens here rather than being left to the CLI because that behaviour
// is documented for `.mcp.json` and not for a file passed with `--mcp-config`.
const VARIABLE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

export interface ExpandResult {
	value: unknown;
	unresolved: string[];
}

export function expandVariables(value: unknown, env: NodeJS.ProcessEnv): ExpandResult {
	const unresolved = new Set<string>();

	const walk = (input: unknown): unknown => {
		if (typeof input === 'string') {
			return input.replace(VARIABLE_PATTERN, (literal, name: string, fallback?: string) => {
				const resolved = env[name];

				if (resolved !== undefined) {
					return resolved;
				}

				if (fallback !== undefined) {
					return fallback;
				}

				// Left as written, the way Claude Code does, so the failure surfaces as a
				// server that cannot authenticate rather than one pointed at an empty URL.
				unresolved.add(name);

				return literal;
			});
		}

		if (Array.isArray(input)) {
			return input.map(walk);
		}

		if (input && typeof input === 'object') {
			return Object.fromEntries(
				Object.entries(input as Record<string, unknown>).map(([key, entry]) => [key, walk(entry)])
			);
		}

		return input;
	};

	return { value: walk(value), unresolved: [...unresolved] };
}

// A `null` entry is an opt-out, not a server. Dropping it after the merge is what
// lets ~/.bosun/mcp.json switch off a default it cannot satisfy.
export function withDefaults(userServers: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries({ ...DEFAULT_SERVERS, ...userServers }).filter(([, server]) => server !== null)
	);
}

export interface McpConfigResult {
	present: boolean;
	servers: Record<string, unknown>;
	serverNames: string[];
	unresolved: string[];
	error: string | null;
}

const EMPTY: McpConfigResult = {
	present: false,
	servers: {},
	serverNames: [],
	unresolved: [],
	error: null
};

export function readMcpConfigFile(opts: {
	raw: string;
	env: NodeJS.ProcessEnv;
}): McpConfigResult {
	let parsed: unknown;

	try {
		parsed = JSON.parse(opts.raw);
	} catch {
		return { ...EMPTY, present: true, error: 'not valid JSON' };
	}

	const validated = McpConfigFileSchema.safeParse(parsed);

	if (!validated.success) {
		return { ...EMPTY, present: true, error: 'expected an object with an "mcpServers" key' };
	}

	const { [RESERVED_SERVER_NAME]: reserved, ...userServers } = validated.data.mcpServers;
	const expanded = expandVariables(withDefaults(userServers), opts.env);

	return {
		present: true,
		servers: expanded.value as Record<string, unknown>,
		serverNames: Object.keys(expanded.value as Record<string, unknown>),
		unresolved: expanded.unresolved,
		error:
			reserved === undefined
				? null
				: `"${RESERVED_SERVER_NAME}" is reserved for bosun's own tools and was ignored`
	};
}

function readRawServers(configPath: string): Record<string, unknown> {
	try {
		const parsed = McpConfigFileSchema.safeParse(JSON.parse(fs.readFileSync(configPath, 'utf8')));

		return parsed.success ? { ...parsed.data.mcpServers } : {};
	} catch {
		return {};
	}
}

function writeServers(configPath: string, servers: Record<string, unknown>): void {
	fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
	fs.writeFileSync(configPath, `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`, {
		mode: 0o600
	});
	// writeFileSync only applies mode when it creates the file, so an existing
	// config would otherwise keep whatever mode it had.
	fs.chmodSync(configPath, 0o600);
}

export function getMcpConfigService(deps: { env: EnvService; homeDir?: string }) {
	const configPath = path.join(deps.homeDir ?? os.homedir(), '.bosun', MCP_CONFIG_FILENAME);

	return {
		configPath,

		// A broken file must not stop planning: the session still gets bosun's own
		// tools, and the reason shows up in preflight instead of as a dead session.
		read(): McpConfigResult {
			if (!fs.existsSync(configPath)) {
				const expanded = expandVariables(withDefaults({}), deps.env.current());
				const servers = expanded.value as Record<string, unknown>;

				return {
					...EMPTY,
					servers,
					serverNames: Object.keys(servers),
					unresolved: expanded.unresolved
				};
			}

			try {
				return readMcpConfigFile({
					raw: fs.readFileSync(configPath, 'utf8'),
					env: deps.env.current()
				});
			} catch {
				return { ...EMPTY, present: true, error: `could not read ${configPath}` };
			}
		},

		// Rewritten whole rather than patched, so a server added here cannot corrupt
		// one already in the file. Unexpanded on purpose: what lands on disk keeps the
		// `${VAR}` reference, and the secret stays in ~/.bosun/env.
		upsert(opts: { name: string; server: unknown }): void {
			const existing = readRawServers(configPath);

			writeServers(configPath, { ...existing, [opts.name]: opts.server });
		},

		remove(name: string): boolean {
			const existing = readRawServers(configPath);

			if (!(name in existing)) {
				return false;
			}

			delete existing[name];
			writeServers(configPath, existing);

			return true;
		},

		// The raw file, not the merged view: `mcp list` has to be able to say which
		// servers the user actually owns and can remove.
		listConfigured(): string[] {
			return Object.keys(readRawServers(configPath));
		}
	};
}

export type McpConfigService = ReturnType<typeof getMcpConfigService>;
