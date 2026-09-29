import { describe, expect, it } from 'vitest';
import { verifyPlanTotal } from './session';
import { parseProjectConfig, type ProjectConfig } from '../project-config';

function config(text: string): ProjectConfig {
	const parsed = parseProjectConfig(text);

	if (!parsed.ok) {
		throw new Error(JSON.stringify(parsed.issues));
	}

	return parsed.config;
}

const FULL = config(`Install:
- install be: pnpm i
- install fe: pnpm i

Apps:
be:
- Start: pnpm local
- Migrate: pnpm migrate
- Codegen: pnpm generate
fe:
- Start: pnpm dev

Test accounts:
- leader: sign in at {url.fe}/login using EMAIL
- developer: sign in at {url.fe}/login using EMAIL2
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
			verifyPlanTotal({ config: config('Apps:\nbe:\n- Start: run\n- Migrate: a\nfe:\n- Start: run\n- Migrate: b\n'), applyMigrations: false })
		).toBe(7);
	});

	it('counts the single "none" line a config with no setup or accounts reports', () => {
		expect(verifyPlanTotal({ config: config('Notes:\nnothing configured\n'), applyMigrations: true })).toBe(6);
	});
});
