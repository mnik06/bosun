import { describe, expect, it } from 'vitest';
import { modesNote, planningPrompt } from './planning';
import { type ReadTree } from '../services/repo.service';

const tree: ReadTree = {
	path: '/home/u/.bosun/read-tree',
	ref: 'origin/main',
	sha: 'abc123def456',
	fresh: true,
	detail: 'origin/main at abc123de'
};

describe('operator notes', () => {
	it('reaches the planning prompt when the machine has them', () => {
		const prompt = planningPrompt({
			input: 'ticket',
			verifyInUi: true,
			auto: false,
			notes: 'Invoke the design skill for any screen work.',
			tree,
			served: null
		});

		expect(prompt).toContain('Operator notes');
		expect(prompt).toContain('Invoke the design skill for any screen work.');
		expect(prompt).not.toContain('{{OPERATOR_NOTES}}');
	});

	it('leaves no placeholder behind when there are none', () => {
		const prompt = planningPrompt({
			input: 'ticket',
			verifyInUi: true,
			auto: false,
			notes: null,
			tree,
			served: null
		});

		expect(prompt).not.toContain('Operator notes');
		expect(prompt).not.toContain('{{OPERATOR_NOTES}}');
	});
});

// A placeholder that survives is sent to the model verbatim, which reads as a
// broken prompt rather than as a missing section — and nothing else catches it.
describe('the checkout the session is told to read', () => {
	it('names the ref and commit it was fetched at', () => {
		const prompt = planningPrompt({
			input: 'ticket',
			verifyInUi: true,
			auto: false,
			notes: null,
			tree,
			served: null
		});

		expect(prompt).toContain('origin/main');
		expect(prompt).toContain('abc123def456');
		expect(prompt).not.toContain('{{REPO_STATE}}');
	});

	it('says so when the fresh checkout could not be produced', () => {
		const prompt = planningPrompt({
			input: 'ticket',
			verifyInUi: true,
			auto: false,
			notes: null,
			tree: {
				path: '/home/u/repo',
				ref: 'the machine checkout',
				sha: null,
				fresh: false,
				detail: 'could not create a read tree: no space left on device'
			},
			served: null
		});

		expect(prompt).toContain('could not be refreshed');
		expect(prompt).toContain('no space left on device');
		expect(prompt).not.toContain('{{REPO_STATE}}');
	});
});

describe('the note for a mode flipped mid-grill', () => {
	it('sends nothing when no flag changed', () => {
		expect(modesNote({ was: { verifyInUi: true, auto: false }, now: { verifyInUi: true, auto: false } })).toBeNull();
	});

	it('names only the flag that changed', () => {
		const note = modesNote({ was: { verifyInUi: true, auto: false }, now: { verifyInUi: true, auto: true } });

		expect(note).toContain('Auto mode is now **on**');
		expect(note).not.toContain('UI verification');
	});

	it('names both when both changed', () => {
		const note = modesNote({ was: { verifyInUi: true, auto: true }, now: { verifyInUi: false, auto: false } });

		expect(note).toContain('Auto mode is now **off**');
		expect(note).toContain('UI verification is now **off**');
	});
});
