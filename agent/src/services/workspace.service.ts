import fs from 'fs';
import os from 'os';
import path from 'path';
import { readConfig, workingRepoPath, writeConfig, type AgentConfig } from '../config/config';
import { type RepoAttach } from '../protocol';
import { PROJECT_CONFIG_PATH } from '../project-config';
import { type ExecService } from './exec.service';

const REPOS_DIRNAME = 'repos';

const CLONE_TIMEOUT_MS = 30 * 60 * 1000;

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

// What git runs on every fetch and push. The agent itself answers: under a
// packaged binary that is the binary, under `node dist/...` it is node and the
// script. `--config` is only named when it is not the default, so a helper line
// copied between machines keeps working.
export function credentialHelperCommand(opts: {
	execPath: string;
	scriptPath: string | undefined;
	configPath: string;
	defaultConfigPath: string;
}): string {
	const packaged = path.basename(opts.execPath).startsWith('bosun-agent');
	const program = packaged || opts.scriptPath === undefined
		? shellQuote(opts.execPath)
		: `${shellQuote(opts.execPath)} ${shellQuote(opts.scriptPath)}`;
	const config = opts.configPath === opts.defaultConfigPath ? '' : ` --config ${shellQuote(opts.configPath)}`;

	return `!${program} git-credential${config}`;
}

export type AttachResult = { ok: true; repoPath: string; configOnDefault: boolean } | { ok: false; detail: string };

// The repository stops being a directory the operator chose and becomes a clone
// the agent owns. Where the installer ran has no bearing on it.
export function getWorkspaceService(deps: {
	exec: ExecService;
	configPath: string;
	defaultConfigPath: string;
	homeDir?: string;
	execPath?: string;
	scriptPath?: string;
}) {
	const bosunDir = path.join(deps.homeDir ?? os.homedir(), '.bosun');
	const reposRoot = path.join(bosunDir, REPOS_DIRNAME);
	// What the last look at the default branch found. `hello` has to go out before
	// anything is awaited, so it carries this rather than asking git again.
	let knownConfigOnDefault: boolean | undefined;
	const attaching = new Map<string, Promise<AttachResult>>();
	const helper = credentialHelperCommand({
		execPath: deps.execPath ?? process.execPath,
		scriptPath: deps.scriptPath ?? process.argv[1],
		configPath: deps.configPath,
		defaultConfigPath: deps.defaultConfigPath
	});

	// Read from disk each time, like every other file under ~/.bosun: an attach
	// rewrites it, and every service that works in the repository has to see the
	// new clone from that moment on without the agent restarting.
	function config(): AgentConfig {
		return readConfig(deps.configPath);
	}

	async function git(args: string[], opts?: { timeoutMs?: number }) {
		return deps.exec.run('git', args, {
			env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
			timeoutMs: opts?.timeoutMs ?? 60_000
		});
	}

	// Set in the clone's own `.git/config`, which its worktrees share. The empty
	// helper first clears whatever a global config added — a `gh` helper left on
	// the box would otherwise answer before bosun's, with a credential that
	// reaches every repository its owner can.
	async function configure(repoPath: string): Promise<string | null> {
		const settings: [string, string][] = [
			['credential.helper', ''],
			['credential.https://github.com.helper', helper]
		];

		for (const [key, value] of settings) {
			const result = await git(['-C', repoPath, 'config', '--replace-all', key, value]);

			if (!result.ok) {
				return `could not set ${key}: ${result.reason}`;
			}
		}

		// A fresh box has no git identity, and every bullet's commit would fail on it.
		const email = await git(['-C', repoPath, 'config', '--get', 'user.email']);

		if (!email.ok || email.stdout === '') {
			await git(['-C', repoPath, 'config', 'user.name', 'bosun']);
			await git(['-C', repoPath, 'config', 'user.email', 'bosun@users.noreply.github.com']);
		}

		return null;
	}

	async function clone(opts: { msg: RepoAttach; target: string }): Promise<string | null> {
		const staging = `${opts.target}.cloning`;

		fs.rmSync(staging, { recursive: true, force: true });
		fs.mkdirSync(reposRoot, { recursive: true, mode: 0o700 });

		const cloned = await git(
			[
				'-c',
				'credential.helper=',
				'-c',
				`credential.https://github.com.helper=${helper}`,
				'clone',
				'--branch',
				opts.msg.defaultBranch,
				opts.msg.cloneUrl,
				staging
			],
			{ timeoutMs: CLONE_TIMEOUT_MS }
		);

		if (!cloned.ok) {
			fs.rmSync(staging, { recursive: true, force: true });

			return `could not clone ${opts.msg.cloneUrl}: ${cloned.reason}`;
		}

		// Renamed into place only once it is whole, so a clone interrupted half way is
		// never mistaken for the repository on the next attempt.
		fs.renameSync(staging, opts.target);

		return null;
	}

	async function refresh(opts: { msg: RepoAttach; target: string }): Promise<string | null> {
		await git(['-C', opts.target, 'remote', 'set-url', 'origin', opts.msg.cloneUrl]);

		const fetched = await git(['-C', opts.target, 'fetch', '--prune', 'origin'], { timeoutMs: CLONE_TIMEOUT_MS });

		return fetched.ok ? null : `could not fetch ${opts.msg.cloneUrl}: ${fetched.reason}`;
	}

	return {
		reposRoot,
		helper,

		repoPath(): string | null {
			try {
				return workingRepoPath(config());
			} catch {
				return null;
			}
		},

		repositoryId(): string | null {
			try {
				return config().repository?.id ?? null;
			} catch {
				return null;
			}
		},

		async configOnDefault(): Promise<boolean | undefined> {
			const current = config();

			if (!current.repository) {
				return undefined;
			}

			const head = await git(['-C', current.repository.path, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
			const ref = head.ok && head.stdout !== '' ? head.stdout : 'HEAD';

			knownConfigOnDefault = (await git(['-C', current.repository.path, 'cat-file', '-e', `${ref}:${PROJECT_CONFIG_PATH}`])).ok;

			return knownConfigOnDefault;
		},

		knownConfigOnDefault(): boolean | undefined {
			return knownConfigOnDefault;
		},

		// One attach per repository at a time. The backend asks again whenever the
		// agent announces without a repository while its row names one — which is
		// also what every announce during a long clone looks like.
		attach(msg: RepoAttach): Promise<AttachResult> {
			const running = attaching.get(msg.repositoryId);

			if (running) {
				return running;
			}

			const started = attachOnce(msg).finally(() => {
				attaching.delete(msg.repositoryId);
			});

			attaching.set(msg.repositoryId, started);

			return started;
		}
	};

	// Idempotent: attaching the repository the machine already has fetches it and
	// rewrites its helper rather than cloning a second copy.
	async function attachOnce(msg: RepoAttach): Promise<AttachResult> {
			const current = config();
			const target = path.join(reposRoot, msg.slug);

			if (current.repository !== undefined && current.repository.id !== msg.repositoryId) {
				return { ok: false, detail: `this machine is already attached to ${current.repository.slug}` };
			}

			const failure = fs.existsSync(path.join(target, '.git'))
				? await refresh({ msg, target })
				: await clone({ msg, target });
			const configured = failure ?? (await configure(target));

			if (configured !== null) {
				return { ok: false, detail: configured };
			}

			await git(['-C', target, 'remote', 'set-head', 'origin', '--auto']);

			// The read tree was a worktree of the checkout the machine used before. Left
			// in place it points at another repository's objects and every planning
			// session would fall back to reading a tree nobody refreshes.
			if (current.repository === undefined) {
				fs.rmSync(path.join(bosunDir, 'read-tree'), { recursive: true, force: true });
			}

			writeConfig({
				configPath: deps.configPath,
				config: { ...current, repository: { id: msg.repositoryId, slug: msg.slug, path: target } }
			});

			const onDefault = await git(['-C', target, 'cat-file', '-e', `origin/${msg.defaultBranch}:${PROJECT_CONFIG_PATH}`]);

			knownConfigOnDefault = onDefault.ok;

			return { ok: true, repoPath: target, configOnDefault: onDefault.ok };
	}
}

export type WorkspaceService = ReturnType<typeof getWorkspaceService>;
