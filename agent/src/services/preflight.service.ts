import { type ClaudeAuthService } from './claude-auth.service';
import { type ExecService } from './exec.service';
import { type PreflightCheck } from '../protocol';

const MIN_NODE = [24, 15] as const;
const MIN_CLAUDE_MAJOR = 2;

// Either is enough to install and run what a session needs. Requiring a specific
// one would fail boxes that are already set up, for no gain.
const PACKAGE_MANAGERS = ['npm', 'pnpm'] as const;

export function isAtLeastMinNode(version: string): boolean {
	const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number);

	return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

export function claudeVersionIsSupported(version: string): boolean {
	// The stream-json event shape is a looser contract than a package version, so
	// a major the parser has never seen is reported rather than assumed to work.
	return Number(version.match(/(\d+)\./)?.[1] ?? 0) >= MIN_CLAUDE_MAJOR;
}

export function getPreflightService(deps: { exec: ExecService; claudeAuth: ClaudeAuthService }) {
	async function checkNode(): Promise<PreflightCheck> {
		const result = await deps.exec.run('node', ['--version']);

		if (!result.ok) {
			return { name: 'node', ok: false, detail: `node: ${result.reason}` };
		}

		return {
			name: 'node',
			ok: isAtLeastMinNode(result.stdout),
			detail: `${result.stdout} (need >= ${MIN_NODE[0]}.${MIN_NODE[1]})`
		};
	}

	async function checkPackageManager(): Promise<PreflightCheck> {
		const results = await Promise.all(
			PACKAGE_MANAGERS.map(async (name) => ({
				name,
				result: await deps.exec.run(name, ['--version'])
			}))
		);
		const found = results.filter((entry) => entry.result.ok);

		return {
			name: 'package-manager',
			ok: found.length > 0,
			detail:
				found.length > 0
					? found.map((entry) => `${entry.name} ${entry.result.stdout}`).join(', ')
					: `neither ${PACKAGE_MANAGERS.join(' nor ')} found on the service PATH`
		};
	}

	// One check, two probes. A missing binary and a missing login are different
	// fixes, so the detail says which one failed rather than collapsing to
	// "claude: failed" and sending the operator to look at the wrong thing.
	async function checkClaude(): Promise<PreflightCheck> {
		const version = await deps.exec.run('claude', ['--version']);

		if (!version.ok) {
			return { name: 'claude', ok: false, detail: `claude: ${version.reason}` };
		}

		if (!claudeVersionIsSupported(version.stdout)) {
			return {
				name: 'claude',
				ok: false,
				detail: `${version.stdout} — bosun is tested against claude ${MIN_CLAUDE_MAJOR}.x`
			};
		}

		const status = await deps.claudeAuth.readStatus();

		return {
			name: 'claude',
			ok: status.loggedIn,
			detail: status.loggedIn ? `${version.stdout} — ${status.detail}` : status.detail
		};
	}

	return {
		async collect(): Promise<PreflightCheck[]> {
			return Promise.all([checkNode(), checkPackageManager(), checkClaude()]);
		}
	};
}

export type PreflightService = ReturnType<typeof getPreflightService>;
