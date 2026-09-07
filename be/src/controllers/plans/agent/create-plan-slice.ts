import { HttpError } from 'src/api/errors/HttpError';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { getAcRepo, type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { getSliceRepo, type SliceRepo } from 'src/repos/plans/slice.repo';
import { type Db } from 'src/services/drizzle/drizzle.service';
import { createSliceId } from 'src/services/ids/id.service';
import { type Ac, type Slice, type SliceKind } from 'src/types/PlanSchema';

// Every AC belongs to exactly one tracer bullet. Claiming one twice is rejected
// here rather than repaired later, because a second claim silently moves work
// between bullets and nothing downstream would notice.
function rejectUnclaimable(opts: { found: Ac[]; codes: string[] }): void {
	const missing = opts.codes.filter((code) => !opts.found.some((ac) => ac.code === code));

	if (missing.length > 0) {
		throw new HttpError(400, `no such acceptance criteria: ${missing.join(', ')}`);
	}

	const claimed = opts.found.filter((ac) => ac.sliceId !== null);

	if (claimed.length > 0) {
		throw new HttpError(
			409,
			`already claimed by another tracer bullet: ${claimed.map((ac) => ac.code).join(', ')}`
		);
	}
}

export async function createPlanSlice(opts: {
	db: Db;
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	id: string;
	machineId: string;
	ordinal: number;
	kind: SliceKind;
	title: string;
	bodyMd?: string;
	acCodes: string[];
}): Promise<Slice> {
	const plan = await getMachinePlan({
		planRepo: opts.planRepo,
		id: opts.id,
		machineId: opts.machineId
	});

	rejectUnclaimable({
		found: await opts.acRepo.listByCodes({ planId: plan.id, codes: opts.acCodes }),
		codes: opts.acCodes
	});

	const slice = await opts.db.transaction(async (tx) => {
		const acRepo = getAcRepo(tx);
		const sliceRepo = getSliceRepo(tx);
		const created = await sliceRepo.create({
			id: createSliceId(),
			planId: plan.id,
			ordinal: opts.ordinal,
			kind: opts.kind,
			title: opts.title,
			bodyMd: opts.bodyMd ?? null
		});

		await acRepo.assignToSlice({ planId: plan.id, codes: opts.acCodes, sliceId: created.id });

		return created;
	});

	await announcePlanArtifact({ acRepo: opts.acRepo, sliceRepo: opts.sliceRepo, planId: plan.id });

	return slice;
}
