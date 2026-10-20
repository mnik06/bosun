import { describe, expect, it } from 'vitest';
import { carriedBullets } from 'src/controllers/line/shared/carried-bullets';
import { type SliceRun } from 'src/types/BuildSchema';
import { EMPTY_FOOTPRINT } from 'src/types/FootprintSchema';
import { type Ac, type Slice } from 'src/types/PlanSchema';

function slice(ordinal: number, kind: Slice['kind'] = 'build'): Slice {
	return { id: `s${ordinal}`, planId: 'p', ordinal, kind, title: `bullet ${ordinal}`, bodyMd: null, foundation: ordinal === 1, footprint: EMPTY_FOOTPRINT, changedFiles: null };
}

function ac(code: string, sliceId: string, implemented: boolean): Ac {
	return { id: code, planId: 'p', code, text: code, sliceId, ordinal: 0, implemented, verified: false, blockedReason: null };
}

function run(opts: { sliceId: string; status: SliceRun['status']; commitSha: string | null; finishedAt: number }): SliceRun {
	return { sliceId: opts.sliceId, phase: null, status: opts.status, commitSha: opts.commitSha, finishedAt: new Date(opts.finishedAt) } as SliceRun;
}

describe('carriedBullets', () => {
	it('carries only the leading finished bullets, with their latest landed commit', () => {
		const carried = carriedBullets({
			slices: [slice(3), slice(1), slice(2), slice(4), slice(5, 'verify')],
			acs: [ac('AC-1', 's1', true), ac('AC-2', 's2', true), ac('AC-3', 's3', false), ac('AC-4', 's4', true)],
			priorRuns: [
				run({ sliceId: 's1', status: 'done', commitSha: 'old', finishedAt: 1 }),
				run({ sliceId: 's1', status: 'done', commitSha: 'new', finishedAt: 2 }),
				run({ sliceId: 's2', status: 'failed', commitSha: 'bad', finishedAt: 3 })
			]
		});

		expect([...carried]).toEqual([
			['s1', { commitSha: 'new' }],
			['s2', { commitSha: null }]
		]);
	});

	it('stops at a bullet with no criteria', () => {
		const carried = carriedBullets({ slices: [slice(1), slice(2)], acs: [ac('AC-2', 's2', true)], priorRuns: [] });

		expect(carried.size).toBe(0);
	});
});
