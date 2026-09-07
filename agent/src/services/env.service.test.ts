import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEnvService, parseEnvFile } from './env.service';

describe('parseEnvFile', () => {
	it('reads plain assignments', () => {
		expect(parseEnvFile('A=1\nB=two')).toEqual({ A: '1', B: 'two' });
	});

	it('ignores comments and blank lines', () => {
		expect(parseEnvFile('# a note\n\n  \nA=1\n')).toEqual({ A: '1' });
	});

	it('strips matching surrounding quotes', () => {
		expect(parseEnvFile('A="q"\nB=\'s\'\nC="mismatched\'')).toEqual({
			A: 'q',
			B: 's',
			C: '"mismatched\''
		});
	});

	it('accepts an export prefix and surrounding whitespace', () => {
		expect(parseEnvFile('export A = 1 ')).toEqual({ A: '1' });
	});

	// Tokens routinely contain '=', so splitting on every one would truncate them.
	it('keeps everything after the first = as the value', () => {
		expect(parseEnvFile('TOKEN=abc=def==')).toEqual({ TOKEN: 'abc=def==' });
	});

	it('skips lines that are not assignments', () => {
		expect(parseEnvFile('not an assignment\n1BAD=x\nA=1')).toEqual({ A: '1' });
	});
});

describe('getEnvService', () => {
	let home: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-env-'));
		fs.mkdirSync(path.join(home, '.bosun'));
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	function write(contents: string): void {
		fs.writeFileSync(path.join(home, '.bosun', 'env'), contents);
	}

	it('overlays the file onto the base environment', () => {
		write('TOKEN=from-file');

		const env = getEnvService({ baseEnv: { EXISTING: 'base' }, homeDir: home });

		expect(env.current()).toEqual({ EXISTING: 'base', TOKEN: 'from-file' });
	});

	// The whole point: systemd reads EnvironmentFile once at unit start, so a token
	// pasted in later is invisible until restart unless the agent re-reads it.
	it('sees a value written after the service was constructed', () => {
		const env = getEnvService({ baseEnv: {}, homeDir: home });

		expect(env.current().TOKEN).toBeUndefined();

		write('TOKEN=added-later');

		expect(env.current().TOKEN).toBe('added-later');
	});

	it('lets the file win over a stale base value', () => {
		write('TOKEN=fresh');

		const env = getEnvService({ baseEnv: { TOKEN: 'stale' }, homeDir: home });

		expect(env.current().TOKEN).toBe('fresh');
	});

	// The unit's PATH is resolved at install time and is what lets the service find
	// claude and node at all.
	it('refuses to let the file override PATH', () => {
		write('PATH=/nowhere\nOTHER=ok');

		const env = getEnvService({ baseEnv: { PATH: '/resolved/at/install' }, homeDir: home });

		expect(env.current()).toEqual({ PATH: '/resolved/at/install', OTHER: 'ok' });
	});

	it('falls back to the base environment when there is no file', () => {
		const env = getEnvService({ baseEnv: { A: '1' }, homeDir: path.join(home, 'missing') });

		expect(env.current()).toEqual({ A: '1' });
	});
});
