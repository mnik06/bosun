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

describe('env writes', () => {
	let home: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-envw-'));
		fs.mkdirSync(path.join(home, '.bosun'));
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	function service() {
		return getEnvService({ baseEnv: {}, homeDir: home });
	}

	it('creates the file at 0600 on first write', () => {
		const env = service();

		env.set({ variable: 'TOKEN', value: 'a' });

		expect(env.current().TOKEN).toBe('a');
		expect(fs.statSync(env.envPath).mode & 0o777).toBe(0o600);
	});

	// Appending a second assignment would leave the file with two answers.
	it('replaces an existing assignment in place', () => {
		const env = service();

		env.set({ variable: 'TOKEN', value: 'first' });
		env.set({ variable: 'OTHER', value: 'keep' });
		env.set({ variable: 'TOKEN', value: 'second' });

		const contents = fs.readFileSync(env.envPath, 'utf8');

		expect(contents.match(/^TOKEN=/gm)).toHaveLength(1);
		expect(env.current()).toEqual({ TOKEN: 'second', OTHER: 'keep' });
	});

	it('replaces an export-prefixed assignment too', () => {
		fs.writeFileSync(path.join(home, '.bosun', 'env'), 'export TOKEN=old\n');

		const env = service();

		env.set({ variable: 'TOKEN', value: 'new' });

		expect(env.current().TOKEN).toBe('new');
		expect(fs.readFileSync(env.envPath, 'utf8')).not.toContain('old');
	});

	it('does not mangle a file with no trailing newline', () => {
		fs.writeFileSync(path.join(home, '.bosun', 'env'), 'A=1');

		const env = service();

		env.set({ variable: 'B', value: '2' });

		expect(env.current()).toEqual({ A: '1', B: '2' });
	});

	it('reports whether a variable is set', () => {
		const env = service();

		expect(env.has('TOKEN')).toBe(false);
		env.set({ variable: 'TOKEN', value: 'x' });
		expect(env.has('TOKEN')).toBe(true);
	});
});
