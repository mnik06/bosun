import { describe, expect, it } from 'vitest';
import { parseProjectConfig, type ConfigIssue } from 'src/types/ProjectConfigSchema';

const PLAN_EXAMPLE = `Toolchain:
- Node: 24.15.0
- Package manager: pnpm@11.8.0

Install:
/be: pnpm install --frozen-lockfile (rerun when: be/pnpm-lock.yaml)
/fe: pnpm install --frozen-lockfile (rerun when: fe/pnpm-lock.yaml)

Apps:
be:
- Cwd: be
- Start: pnpm local
- Env PORT: {port}
- Ready: {url.be}/health
- Migrate: pnpm db:migration:run
fe:
- Cwd: fe
- Start: pnpm dev --port {port} --strictPort
- Depends on: be
- Env VITE_API_URL: {url.be}
- Ready: {url.fe}

Feedback loops:
/be: pnpm preflight
/fe: pnpm preflight

Test accounts:
- leader: sign in at {url.fe}/login using TEST_LEADER_EMAIL, TEST_LEADER_PASSWORD

Notes:
Anything a session could not work out by reading the code.
`;

function issues(source: string): ConfigIssue[] {
	const parsed = parseProjectConfig(source);

	return parsed.ok ? [] : parsed.issues;
}

// Line numbers are found in the fixture itself rather than hardcoded, so a test
// stays meaningful when the fixture above changes shape.
function lineOf(source: string, needle: string): number {
	const index = source.split('\n').findIndex((line) => line.includes(needle));

	if (index === -1) {
		throw new Error(`fixture bug: "${needle}" is not in the source`);
	}

	return index + 1;
}

describe('parseProjectConfig', () => {
	it("accepts the plan's own example and keeps apps in the order they were written", () => {
		const parsed = parseProjectConfig(PLAN_EXAMPLE);

		expect(parsed.ok).toBe(true);
		if (!parsed.ok) {
			return;
		}

		// Ports are handed out by position, so the order is part of the contract.
		expect(Object.keys(parsed.config.apps)).toEqual(['be', 'fe']);
		expect(parsed.config.toolchain).toEqual({ node: '24.15.0', packageManager: 'pnpm@11.8.0' });
		expect(parsed.config.setup).toEqual([
			{ name: 'be', cwd: 'be', run: 'pnpm install --frozen-lockfile', rerunWhen: ['be/pnpm-lock.yaml'] },
			{ name: 'fe', cwd: 'fe', run: 'pnpm install --frozen-lockfile', rerunWhen: ['fe/pnpm-lock.yaml'] }
		]);
		// A lone per-directory command may omit its label (AC-7): a check gets no name.
		expect(parsed.config.checks).toEqual([
			{ cwd: 'be', run: 'pnpm preflight' },
			{ cwd: 'fe', run: 'pnpm preflight' }
		]);
		expect(parsed.config.testAccounts).toEqual([
			{ role: 'leader', signIn: '{url.fe}/login', secrets: ['TEST_LEADER_EMAIL', 'TEST_LEADER_PASSWORD'] }
		]);
		expect(parsed.config.notes).toBe('Anything a session could not work out by reading the code.\n');
	});

	it('names a dependsOn cycle', () => {
		const source = PLAN_EXAMPLE.replace('- Migrate: pnpm db:migration:run', '- Migrate: pnpm db:migration:run\n- Depends on: fe');

		expect(issues(source)).toEqual([{ line: lineOf(source, 'Apps:'), message: 'dependsOn forms a cycle: be → fe → be' }]);
	});

	it('refuses a placeholder that names no app, at the line that holds it', () => {
		const source = PLAN_EXAMPLE.replace('Env VITE_API_URL: {url.be}', 'Env VITE_API_URL: {url.api}');

		expect(issues(source)).toEqual([{ line: lineOf(source, 'Env VITE_API_URL:'), message: '{url.api} names no app in apps' }]);
	});

	// A test account is signed into from outside any app, so there is no "own" port
	// for a bare placeholder to mean.
	it('refuses a bare placeholder outside an app', () => {
		const source = PLAN_EXAMPLE.replace('sign in at {url.fe}/login', 'sign in at {url}/login');

		expect(issues(source)).toEqual([
			{ line: lineOf(source, 'sign in at'), message: '{url} only means something inside an app — name one, as {url.<app>}' }
		]);
	});

	it("refuses an eleventh app, which would take a port outside the build's range", () => {
		const apps = Array.from({ length: 11 }, (_, index) => `a${index}:\n- Start: run`).join('\n');
		const source = `Apps:\n${apps}\n`;

		expect(issues(source)).toEqual([
			{ line: lineOf(source, 'Apps:'), message: 'at most 10 apps — a build holds ten ports and each app takes one' }
		]);
	});

	it('refuses a path that climbs out of the repository', () => {
		const source = PLAN_EXAMPLE.replace('- Cwd: fe', '- Cwd: ../fe');

		expect(issues(source)).toEqual([{ line: lineOf(source, '- Cwd: ../fe'), message: 'must be a relative path inside the repository' }]);
	});

	it('refuses a range where the toolchain needs an exact version', () => {
		const source = PLAN_EXAMPLE.replace('Node: 24.15.0', 'Node: >=24');

		expect(issues(source)).toEqual([{ line: lineOf(source, 'Node: >=24'), message: 'must be an exact version, such as 24.15.0' }]);
	});

	// Two setup steps of one name would share one `rerunWhen` hash, and one of them
	// would never run again.
	it('refuses two setup steps with the same name', () => {
		const source = PLAN_EXAMPLE.replace(
			'/be: pnpm install --frozen-lockfile (rerun when: be/pnpm-lock.yaml)',
			'/be:\n- be: pnpm install --frozen-lockfile (rerun when: be/pnpm-lock.yaml)\n- be: pnpm install --frozen-lockfile twice'
		);

		expect(issues(source)).toEqual([
			{ line: lineOf(source, 'twice'), message: 'be is used by another setup step — rerunWhen is tracked by name' }
		]);
	});

	it('accepts the single-command shorthand for a whole Install: section', () => {
		const parsed = parseProjectConfig('Install: npm ci\n');

		expect(parsed.ok).toBe(true);
		expect(parsed.ok && parsed.config.setup).toEqual([{ name: 'install', run: 'npm ci' }]);
	});

	it('requires a label on every bulleted entry inside a directory block', () => {
		const source = 'Feedback loops:\n/be:\n- pnpm preflight\n';

		expect(issues(source)).toEqual([{ line: 3, message: 'expected `- Label: command`' }]);
	});

	it('parses Reset database: and Regenerate:', () => {
		// Inserted before `Notes:`, which otherwise reads to end of document and
		// would swallow anything appended after it.
		const source = PLAN_EXAMPLE.replace(
			'Notes:',
			`Reset database:
- Cwd: be
- Run: pnpm db:reset

Regenerate:
/be:
- Migrations (when be/drizzle-out/** changes): pnpm db:migration:generate

Notes:`
		);
		const parsed = parseProjectConfig(source);

		expect(parsed.ok).toBe(true);
		expect(parsed.ok && parsed.config.verify).toEqual({ resetDatabase: { cwd: 'be', run: 'pnpm db:reset' } });
		expect(parsed.ok && parsed.config.regenerate).toEqual([
			{ name: 'Migrations', cwd: 'be', paths: ['be/drizzle-out/**'], run: 'pnpm db:migration:generate' }
		]);
	});

	it('refuses empty or whitespace-only text without a line', () => {
		expect(issues('')).toEqual([{ line: null, message: 'must not be empty' }]);
		expect(issues('   \n\t\n')).toEqual([{ line: null, message: 'must not be empty' }]);
	});

	it('refuses a document over the length limit without a line', () => {
		expect(issues('a'.repeat(100_001))).toEqual([{ line: null, message: 'longer than 100000 characters' }]);
	});

	it('refuses a line that belongs to no section', () => {
		const source = 'not a header\nApps:\n';

		expect(issues(source)).toEqual([{ line: 1, message: 'expected a section header' }]);
	});

	it('refuses a section repeated, and ignores its second body', () => {
		const source = 'Toolchain:\n- Node: 24.15.0\nToolchain:\n- Node: 20.0.0\n';

		expect(issues(source)).toEqual([{ line: 3, message: 'Toolchain: appears more than once' }]);
	});

	// Both the grammar problem (the stray line) and the schema problem it leaves
	// behind (no Node: line means no toolchain.node) are reported together.
	it('reports an unrecognized line inside a section, alongside what it left invalid', () => {
		const source = 'Toolchain:\nsomething else\n';

		expect(issues(source)).toEqual([
			{ line: 2, message: 'expected `- Node: <version>` or `- Package manager: <name>@<version>`' },
			{ line: 1, message: 'Invalid input: expected string, received undefined' }
		]);
	});
});
