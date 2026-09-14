import { describe, expect, it } from 'vitest';
import { parseProjectConfig, type ConfigIssue } from 'src/types/ProjectConfigSchema';

const PLAN_EXAMPLE = `version: 1

toolchain:
  node: "24.15.0"
  packageManager: "pnpm@11.8.0"

setup:
  - name: install be
    cwd: be
    run: pnpm install --frozen-lockfile
    rerunWhen: [be/pnpm-lock.yaml]

apps:
  be:
    cwd: be
    start: pnpm local
    env:
      PORT: "{port}"
    ready: "{url.be}/health"
    migrate: pnpm db:migration:run
  fe:
    cwd: fe
    start: pnpm dev --port {port} --strictPort
    dependsOn: [be]
    env:
      VITE_API_URL: "{url.be}"
    ready: "{url.fe}"

checks:
  - cwd: be
    run: pnpm preflight

testAccounts:
  - role: leader
    signIn: "{url.fe}/login"
    secrets: [TEST_LEADER_EMAIL, TEST_LEADER_PASSWORD]
`;

function issues(source: string): ConfigIssue[] {
	const parsed = parseProjectConfig(source);

	return parsed.ok ? [] : parsed.issues;
}

describe('parseProjectConfig', () => {
	it('accepts the plan\'s own example and keeps apps in the order they were written', () => {
		const parsed = parseProjectConfig(PLAN_EXAMPLE);

		expect(parsed.ok).toBe(true);
		// Ports are handed out by position, so the order is part of the contract.
		expect(parsed.ok && Object.keys(parsed.config.apps)).toEqual(['be', 'fe']);
	});

	it('names a dependsOn cycle', () => {
		const source = PLAN_EXAMPLE.replace('    migrate: pnpm db:migration:run', '    dependsOn: [fe]');

		expect(issues(source)).toEqual([{ path: 'apps', message: 'dependsOn forms a cycle: be → fe → be' }]);
	});

	it('refuses a placeholder that names no app, at the field that holds it', () => {
		const source = PLAN_EXAMPLE.replace('VITE_API_URL: "{url.be}"', 'VITE_API_URL: "{url.api}"');

		expect(issues(source)).toEqual([{ path: 'apps.fe.env.VITE_API_URL', message: '{url.api} names no app in apps' }]);
	});

	// A test account is signed into from outside any app, so there is no "own" port
	// for a bare placeholder to mean.
	it('refuses a bare placeholder outside an app', () => {
		const source = PLAN_EXAMPLE.replace('signIn: "{url.fe}/login"', 'signIn: "{url}/login"');

		expect(issues(source)).toEqual([
			{ path: 'testAccounts[0].signIn', message: '{url} only means something inside an app — name one, as {url.<app>}' }
		]);
	});

	it('refuses an eleventh app, which would take a port outside the build\'s range', () => {
		const apps = Array.from({ length: 11 }, (_, index) => `  a${index}:\n    start: run`).join('\n');

		expect(issues(`version: 1\napps:\n${apps}\n`)).toEqual([
			{ path: 'apps', message: 'at most 10 apps — a build holds ten ports and each app takes one' }
		]);
	});

	it('refuses a path that climbs out of the repository', () => {
		const source = PLAN_EXAMPLE.replace('    cwd: fe', '    cwd: ../fe');

		expect(issues(source)).toEqual([{ path: 'apps.fe.cwd', message: 'must be a relative path inside the repository' }]);
	});

	it('refuses a range where the toolchain needs an exact version', () => {
		expect(issues(PLAN_EXAMPLE.replace('node: "24.15.0"', 'node: ">=24"'))).toEqual([
			{ path: 'toolchain.node', message: 'must be an exact version, such as 24.15.0' }
		]);
	});

	// Two setup steps of one name would share one `rerunWhen` hash, and one of them
	// would never run again.
	it('refuses two setup steps with the same name', () => {
		const source = PLAN_EXAMPLE.replace(
			'    rerunWhen: [be/pnpm-lock.yaml]',
			'    rerunWhen: [be/pnpm-lock.yaml]\n  - name: install be\n    run: pnpm install'
		);

		expect(issues(source).map((issue) => issue.path)).toEqual(['setup[1].name']);
	});

	it('reports broken YAML and unknown fields as issues rather than throwing', () => {
		expect(issues('version: [1')[0]?.path).toBe('(yaml)');
		expect(issues('version: 1\nversoin: 1\n')[0]?.message).toMatch(/unrecognized key/i);
		expect(issues('version: 1\nversion: 2\n')[0]?.path).toBe('(yaml)');
	});
});
