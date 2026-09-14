import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveProjectConfig } from './config-resolution';

const VALID = 'version: 1\nnotes: from the file\n';
const DRAFT = 'version: 1\nnotes: from the draft\n';
const trees: string[] = [];

function tree(file?: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-config-'));

	trees.push(dir);

	if (file !== undefined) {
		fs.mkdirSync(path.join(dir, '.bosun'));
		fs.writeFileSync(path.join(dir, '.bosun', 'project.yaml'), file);
	}

	return dir;
}

afterEach(() => {
	for (const dir of trees.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe('resolveProjectConfig', () => {
	it('uses the tree\'s file over the draft', () => {
		const resolved = resolveProjectConfig({ treePath: tree(VALID), draft: DRAFT });

		expect(resolved.source === 'file' && resolved.config.notes).toBe('from the file');
	});

	it('uses the draft only when the tree has no file', () => {
		const resolved = resolveProjectConfig({ treePath: tree(), draft: DRAFT });

		expect(resolved.source === 'draft' && resolved.config.notes).toBe('from the draft');
		expect(resolveProjectConfig({ treePath: tree(), draft: null })).toEqual({ source: 'none' });
	});

	// Onboarding proposes a change to a file that already exists; its verify has to
	// run the proposal, or the pull request carries a config nobody watched run.
	it('uses the draft over the file only when told to prefer it', () => {
		const resolved = resolveProjectConfig({ treePath: tree(VALID), draft: DRAFT, preferDraft: true });

		expect(resolved.source === 'draft' && resolved.config.notes).toBe('from the draft');
	});

	// Falling back would run a branch against a config it no longer matches, and
	// fail somewhere far less legible than naming the field here.
	it('never falls back to a working draft from a broken file', () => {
		expect(resolveProjectConfig({ treePath: tree('version: 1\napps:\n  be:\n    cwd: be\n'), draft: DRAFT })).toEqual({
			source: 'invalid',
			origin: 'file',
			detail: expect.stringContaining('.bosun/project.yaml is invalid — apps.be.start:')
		});
	});
});
