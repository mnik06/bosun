import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { readClaudeAuthStatus } from './claude-credential';
import { type ClaudeAuthMode, type PreflightCheck } from './protocol';

const exec = promisify(execFile);

const MIN_NODE = [24, 15];
const MIN_CLAUDE_MAJOR = 2;

async function tryExec(
	command: string,
	args: string[],
	opts?: { cwd?: string }
): Promise<{ ok: boolean; stdout: string }> {
	try {
		const { stdout } = await exec(command, args, { cwd: opts?.cwd, timeout: 10_000 });

		return { ok: true, stdout: stdout.trim() };
	} catch {
		return { ok: false, stdout: '' };
	}
}

function isAtLeastMinNode(version: string): boolean {
	const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number);

	return major > MIN_NODE[0]! || (major === MIN_NODE[0]! && minor >= MIN_NODE[1]!);
}

async function checkNode(): Promise<PreflightCheck> {
	const result = await tryExec('node', ['--version']);

	if (!result.ok) {
		return { name: 'node', ok: false, detail: 'node not found on PATH' };
	}

	return {
		name: 'node',
		ok: isAtLeastMinNode(result.stdout),
		detail: `${result.stdout} (need >= 24.15)`
	};
}

async function checkPnpm(): Promise<PreflightCheck> {
	const result = await tryExec('pnpm', ['--version']);

	return {
		name: 'pnpm',
		ok: result.ok,
		detail: result.ok ? result.stdout : 'pnpm not found on PATH'
	};
}

async function checkGitClean(repoPath: string): Promise<PreflightCheck> {
	const result = await tryExec('git', ['status', '--porcelain'], { cwd: repoPath });

	if (!result.ok) {
		return { name: 'git-clean', ok: false, detail: `not a git repo: ${repoPath}` };
	}

	const dirty = result.stdout.split('\n').filter(Boolean).length;

	return {
		name: 'git-clean',
		ok: dirty === 0,
		detail: dirty === 0 ? 'clean' : `${dirty} uncommitted change(s)`
	};
}

async function checkGhAuth(): Promise<PreflightCheck> {
	const result = await tryExec('gh', ['auth', 'status']);

	return {
		name: 'gh-auth',
		ok: result.ok,
		detail: result.ok ? 'authenticated' : 'gh auth status failed'
	};
}

async function checkClaudeCli(): Promise<PreflightCheck> {
	const result = await tryExec('claude', ['--version']);

	if (!result.ok) {
		return { name: 'claude-cli', ok: false, detail: 'claude not found on PATH' };
	}

	// The stream-json event shape is a looser contract than a package version, so
	// a major the parser has never seen is reported rather than assumed to work.
	const major = Number(result.stdout.match(/(\d+)\./)?.[1] ?? 0);

	return {
		name: 'claude-cli',
		ok: major >= MIN_CLAUDE_MAJOR,
		detail:
			major >= MIN_CLAUDE_MAJOR
				? result.stdout
				: `${result.stdout} — bosun is tested against claude ${MIN_CLAUDE_MAJOR}.x`
	};
}

async function checkClaudeCredential(): Promise<{
	check: PreflightCheck;
	mode: ClaudeAuthMode | null;
}> {
	const result = await tryExec('claude', ['auth', 'status', '--json']);

	if (!result.ok) {
		return {
			check: { name: 'claude-credential', ok: false, detail: '`claude auth status` failed' },
			mode: null
		};
	}

	const status = readClaudeAuthStatus(result.stdout);

	return {
		check: { name: 'claude-credential', ok: status.loggedIn, detail: status.detail },
		mode: status.mode
	};
}

function checkPlaywright(): PreflightCheck {
	const cacheDir = path.join(os.homedir(), '.cache', 'ms-playwright');
	const installed = fs.existsSync(cacheDir)
		? fs.readdirSync(cacheDir).some((entry) => entry.startsWith('chromium'))
		: false;

	return {
		name: 'playwright',
		ok: installed,
		detail: installed ? 'chromium present' : 'no chromium build in ~/.cache/ms-playwright'
	};
}

function checkMcpJson(repoPath: string): PreflightCheck {
	const mcpPath = path.join(repoPath, '.mcp.json');
	const present = fs.existsSync(mcpPath);

	return {
		name: 'mcp-json',
		ok: present,
		detail: present ? mcpPath : `missing ${mcpPath}`
	};
}

function checkViteEnv(repoPath: string): PreflightCheck {
	const envPath = path.join(repoPath, 'fe', '.env');

	if (!fs.existsSync(envPath)) {
		return { name: 'vite-env', ok: false, detail: `missing ${envPath}` };
	}

	const line = fs
		.readFileSync(envPath, 'utf8')
		.split('\n')
		.find((entry) => entry.startsWith('VITE_API_URL='));

	if (!line) {
		return { name: 'vite-env', ok: false, detail: 'VITE_API_URL not set' };
	}

	const onLoopbackIp = line.includes('127.0.0.1');

	return {
		name: 'vite-env',
		ok: onLoopbackIp,
		detail: onLoopbackIp ? line : `${line} — must use 127.0.0.1, not localhost`
	};
}

export interface PreflightReport {
	checks: PreflightCheck[];
	claudeAuthMode: ClaudeAuthMode | null;
}

export async function collectPreflight(repoPath: string): Promise<PreflightReport> {
	const [node, pnpm, gitClean, ghAuth, claudeCli, credential] = await Promise.all([
		checkNode(),
		checkPnpm(),
		checkGitClean(repoPath),
		checkGhAuth(),
		checkClaudeCli(),
		checkClaudeCredential()
	]);

	return {
		checks: [
			node,
			pnpm,
			gitClean,
			ghAuth,
			claudeCli,
			credential.check,
			checkPlaywright(),
			checkMcpJson(repoPath),
			checkViteEnv(repoPath)
		],
		claudeAuthMode: credential.mode
	};
}
