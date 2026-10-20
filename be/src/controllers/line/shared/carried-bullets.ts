import { type SliceRun } from 'src/types/BuildSchema';
import { type Ac, type Slice } from 'src/types/PlanSchema';

export type CarriedBullet = { commitSha: string | null };

// A plan approved again — revised after a failure, say — builds on the same
// branch, and the bullets an earlier build already delivered are on it. Only the
// leading run of them is carried: a bullet after an unfinished one may have been
// built on what that one is about to change. A bullet with no criteria proves
// nothing, and a verify bullet always runs, since it judges the build as a whole.
export function carriedBullets(opts: { slices: Slice[]; acs: Ac[]; priorRuns: SliceRun[] }): Map<string, CarriedBullet> {
	const carried = new Map<string, CarriedBullet>();
	const ordered = opts.slices.filter((slice) => slice.kind === 'build').sort((a, b) => a.ordinal - b.ordinal);

	for (const slice of ordered) {
		const own = opts.acs.filter((ac) => ac.sliceId === slice.id);

		if (own.length === 0 || own.some((ac) => !ac.implemented)) {
			break;
		}

		const landed = opts.priorRuns
			.filter((run) => run.sliceId === slice.id && run.phase === null && run.status === 'done' && run.commitSha !== null)
			.sort((a, b) => (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0))
			.at(-1);

		carried.set(slice.id, { commitSha: landed?.commitSha ?? null });
	}

	return carried;
}
