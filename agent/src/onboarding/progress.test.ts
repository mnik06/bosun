import { describe, expect, it } from 'vitest';
import { verifyPlanTotal } from './session';
import { parseProjectConfig, type ProjectConfig } from '../project-config';

function config(yaml: string): ProjectConfig {
	const parsed = parseProjectConfig(yaml);

	if (!parsed.ok) {
		throw new Error(JSON.stringify(parsed.issues));
	}

	return parsed.config;
}

const FULL = config(`version: 1
setup:
  - name: install be
    run: pnpm i
  - name: install fe
    run: pnpm i
apps:
  be:
    start: pnpm local
    migrate: pnpm migrate
    codegen: pnpm generate
  fe:
    start: pnpm dev
testAccounts:
  - role: leader
    signIn: "{url.fe}/login"
    secrets: [EMAIL]
  - role: developer
    signIn: "{url.fe}/login"
    secrets: [EMAIL2]
`);

// The verify percentage the operator watches is steps finished over this total,
// so a total that disagrees with what verify reports is a bar that stops short of
// the end or runs past it.
describe('verifyPlanTotal', () => {
	it('counts every step verify reports as finished', () => {
		// resolve, env, toolchain + 2 setup + 1 codegen + 1 migrate + start + browser + 2 sign-ins
		expect(verifyPlanTotal({ config: FULL, applyMigrations: true })).toBe(11);
	});

	it('counts one skipped-migrations line in place of the migrations', () => {
		expect(verifyPlanTotal({ config: FULL, applyMigrations: false })).toBe(11);
		// resolve, env, toolchain + no-setup line + skipped migrations + start + no-accounts line
		expect(
			verifyPlanTotal({ config: config('version: 1\napps:\n  be:\n    start: run\n    migrate: a\n  fe:\n    start: run\n    migrate: b\n'), applyMigrations: false })
		).toBe(7);
	});

	it('counts the single "none" line a config with no setup or accounts reports', () => {
		expect(verifyPlanTotal({ config: config('version: 1\n'), applyMigrations: true })).toBe(6);
	});
});
