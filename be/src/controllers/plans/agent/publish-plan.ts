import { HttpError } from 'src/api/errors/HttpError';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan, announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { getAcRepo } from 'src/repos/plans/ac.repo';
import { getPlanRepo, type PlanRepo } from 'src/repos/plans/plan.repo';
import { getSliceRepo } from 'src/repos/plans/slice.repo';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type Db } from 'src/services/drizzle/drizzle.service';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan, type SliceKind } from 'src/types/PlanSchema';

export interface PublishAc {
	code: string;
	text: string;
}

export interface PublishSlice {
	ordinal: number;
	kind: SliceKind;
	title: string;
	bodyMd?: string | null;
	acCodes: string[];
}

// The whole artifact arrives at once, so the browser never sees a plan with two
// of its four bullets written. It is also what makes a revision cheap: the
// session republishes what the plan should now be, rather than reconciling the
// difference against what it published an hour ago.
function rejectMalformed(opts: {
	verifyInUi: boolean;
	acs: PublishAc[];
	slices: PublishSlice[];
}): void {
	const codes = opts.acs.map((ac) => ac.code);

	if (new Set(codes).size !== codes.length) {
		throw new HttpError(400, 'the same acceptance criterion code appears twice');
	}

	const claimed = opts.slices.flatMap((slice) => slice.acCodes);
	const unknown = claimed.filter((code) => !codes.includes(code));

	if (unknown.length > 0) {
		throw new HttpError(400, `no such acceptance criteria: ${[...new Set(unknown)].join(', ')}`);
	}

	if (new Set(claimed).size !== claimed.length) {
		throw new HttpError(400, 'an acceptance criterion is claimed by more than one tracer bullet');
	}

	const orphans = codes.filter((code) => !claimed.includes(code));

	if (orphans.length > 0) {
		throw new HttpError(400, `no tracer bullet claims ${orphans.join(', ')}`);
	}

	rejectBadVerify(opts);
}

function rejectBadVerify(opts: { verifyInUi: boolean; slices: PublishSlice[] }): void {
	const verify = opts.slices.filter((slice) => slice.kind === 'verify');

	if (!opts.verifyInUi) {
		if (verify.length > 0) {
			throw new HttpError(400, 'this plan was created with UI verification off, so it takes no verify bullet');
		}

		return;
	}

	if (verify.length !== 1) {
		throw new HttpError(400, 'a plan with UI verification on ends in exactly one verify bullet');
	}

	const last = [...opts.slices].sort((a, b) => a.ordinal - b.ordinal).at(-1);

	if (last?.kind !== 'verify') {
		throw new HttpError(400, 'the verify bullet is the last one');
	}

	if (verify[0]!.acCodes.length > 0) {
		throw new HttpError(400, 'a verify bullet claims no acceptance criteria of its own');
	}
}

// A session that can publish any plan can rewrite work nobody asked it to touch,
// so rewriting somebody else's plan is allowed only from a preparation plan that
// was created with this one in its selection. The scope is read off that plan's
// row rather than taken from the request: the session names which preparation it
// is acting for, and the backend decides whether that preparation covers the
// target. It closes when the preparation session ends, because a plan that has
// left `planning` is no longer writing anything.
async function requirePreparationScope(opts: {
	planRepo: PlanRepo;
	preparedBy: string;
	machineId: string;
	targetId: string;
}): Promise<void> {
	const preparation = await opts.planRepo.getByIdForMachine({
		id: opts.preparedBy,
		machineId: opts.machineId
	});

	if (
		!preparation ||
		preparation.status !== 'planning' ||
		!preparation.preparesPlanIds?.includes(opts.targetId)
	) {
		throw new HttpError(403, 'That plan is not one this preparation was asked to rewrite');
	}
}

export async function publishPlan(opts: {
	db: Db;
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	id: string;
	machineId: string;
	preparedBy?: string | null;
	title: string;
	bodyMd: string;
	acs: PublishAc[];
	slices: PublishSlice[];
}): Promise<Plan> {
	const plan = await getMachinePlan({
		planRepo: opts.planRepo,
		id: opts.id,
		machineId: opts.machineId
	});

	if (opts.preparedBy) {
		await requirePreparationScope({
			planRepo: opts.planRepo,
			preparedBy: opts.preparedBy,
			machineId: opts.machineId,
			targetId: plan.id
		});
	}

	rejectMalformed({ verifyInUi: plan.verifyInUi, acs: opts.acs, slices: opts.slices });

	const published = await opts.db.transaction(async (tx) => {
		const planRepo = getPlanRepo(tx);
		const acRepo = getAcRepo(tx);
		const sliceRepo = getSliceRepo(tx);

		// A republish is a different plan, whatever it is called. Keeping the
		// sign-off would let a revision walk into a queue on the strength of a read
		// somebody gave the version before it.
		const updated = await planRepo.update({
			id: plan.id,
			title: opts.title,
			bodyMd: opts.bodyMd,
			confirmedAt: null
		});

		const sliceIdByOrdinal = await writeSlices({ sliceRepo, idService: opts.idService, planId: plan.id, slices: opts.slices });

		await writeAcs({
			acRepo,
			idService: opts.idService,
			planId: plan.id,
			acs: opts.acs,
			slices: opts.slices,
			sliceIdByOrdinal
		});

		return updated;
	});

	if (!published) {
		throw new HttpError(404, 'Plan not found');
	}

	announcePlan({ socketRegistry: opts.socketRegistry, plan: published });
	await announcePlanArtifact({
		socketRegistry: opts.socketRegistry,
		acRepo: opts.acRepo,
		sliceRepo: opts.sliceRepo,
		planId: plan.id
	});

	return published;
}

// Matched by ordinal so a republish keeps the slice rows a queue may already
// have runs against, instead of deleting the bullet out from under them.
async function writeSlices(opts: {
	sliceRepo: SliceRepo;
	idService: IdService;
	planId: string;
	slices: PublishSlice[];
}): Promise<Map<number, string>> {
	const existing = await opts.sliceRepo.listByPlan(opts.planId);
	const byOrdinal = new Map(existing.map((slice) => [slice.ordinal, slice]));
	const ids = new Map<number, string>();

	for (const slice of opts.slices) {
		const found = byOrdinal.get(slice.ordinal);
		// A verify bullet's body is never written: its job is fixed, and a
		// description of it is where invented work gets smuggled in.
		const bodyMd = slice.kind === 'verify' ? null : slice.bodyMd ?? null;

		if (found) {
			await opts.sliceRepo.updateInPlan({
				id: found.id,
				planId: opts.planId,
				kind: slice.kind,
				title: slice.title,
				bodyMd
			});
			ids.set(slice.ordinal, found.id);

			continue;
		}

		const created = await opts.sliceRepo.create({
			id: opts.idService.createSliceId(),
			planId: opts.planId,
			ordinal: slice.ordinal,
			kind: slice.kind,
			title: slice.title,
			bodyMd
		});

		ids.set(slice.ordinal, created.id);
	}

	for (const slice of existing) {
		if (!ids.has(slice.ordinal)) {
			await opts.sliceRepo.deleteInPlan({ id: slice.id, planId: opts.planId });
		}
	}

	return ids;
}

// Matched by code, and `implemented`/`verified` are never written here: a
// republish that reset them would hand a queue a criterion it has already met.
async function writeAcs(opts: {
	acRepo: AcRepo;
	idService: IdService;
	planId: string;
	acs: PublishAc[];
	slices: PublishSlice[];
	sliceIdByOrdinal: Map<number, string>;
}): Promise<void> {
	const existing = await opts.acRepo.listByPlan(opts.planId);
	const byCode = new Map(existing.map((ac) => [ac.code, ac]));
	const ownerOf = new Map(
		opts.slices.flatMap((slice) =>
			slice.acCodes.map((code) => [code, opts.sliceIdByOrdinal.get(slice.ordinal) ?? null] as const)
		)
	);

	for (const [index, ac] of opts.acs.entries()) {
		const found = byCode.get(ac.code);
		const sliceId = ownerOf.get(ac.code) ?? null;

		if (found) {
			await opts.acRepo.updateInPlan({
				id: found.id,
				planId: opts.planId,
				text: ac.text,
				ordinal: index + 1,
				sliceId
			});

			continue;
		}

		const created = await opts.acRepo.create({
			id: opts.idService.createAcId(),
			planId: opts.planId,
			code: ac.code,
			text: ac.text,
			ordinal: index + 1
		});

		await opts.acRepo.updateInPlan({ id: created.id, planId: opts.planId, sliceId });
	}

	const keep = new Set(opts.acs.map((ac) => ac.code));

	for (const ac of existing) {
		if (!keep.has(ac.code)) {
			await opts.acRepo.deleteInPlan({ id: ac.id, planId: opts.planId });
		}
	}
}
