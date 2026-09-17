import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { removeWorktree, stopRunningJobs } from 'src/controllers/line/shared/lifecycle';
import { notifyBuildStatus } from 'src/controllers/line/shared/notify';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan, announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { getAcRepo, type AcRepo } from 'src/repos/plans/ac.repo';
import { getPlanRepo } from 'src/repos/plans/plan.repo';
import { getSliceRepo, type SliceRepo } from 'src/repos/plans/slice.repo';
import { type IdService } from 'src/services/ids/id.service';
import { EMPTY_FOOTPRINT, sharedPieces, type Footprint } from 'src/types/FootprintSchema';
import { type Plan, type SliceKind } from 'src/types/PlanSchema';

// A plan holds its build slot to its last bullet, so a twelve-bullet plan holds one
// for most of a day and every plan waiting on its whole feature waits with it. Six
// leaves room for a foundation bullet on top of the three or four the prompt asks for.
export const MAX_BUILD_BULLETS = 6;

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
	foundation: boolean;
	footprint: Footprint | null;
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
	rejectBadFootprints(opts.slices);
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

// Enforced, not suggested. Every piece another plan could consume — schema,
// contracts, a created shared module — is in bullet 1, and bullet 1 is marked the
// foundation: it is the commit a dependent stacks on, so a dependent waits one
// bullet rather than a whole feature.
function rejectBadFootprints(slices: PublishSlice[]): void {
	const build = [...slices].filter((slice) => slice.kind === 'build').sort((a, b) => a.ordinal - b.ordinal);

	if (build.length > MAX_BUILD_BULLETS) {
		throw new HttpError(400, `this plan has ${build.length} build bullets, and a plan takes at most ${MAX_BUILD_BULLETS}: this is more than one feature — split it into plans`);
	}

	for (const slice of slices) {
		if (slice.kind === 'build' && slice.footprint === null) {
			throw new HttpError(400, `bullet ${slice.ordinal} has no footprint — every build bullet declares the schema, contracts and modules it changes`);
		}

		if (slice.kind === 'verify' && (slice.footprint !== null || slice.foundation)) {
			throw new HttpError(400, 'the verify bullet declares no footprint and is never the foundation');
		}
	}

	const [first, ...rest] = build;
	const misplaced = rest.find((slice) => sharedPieces(slice.footprint!) > 0);

	if (rest.some((slice) => slice.foundation)) {
		throw new HttpError(400, 'only the first bullet can be the foundation');
	}

	if (misplaced) {
		throw new HttpError(400, `bullet ${misplaced.ordinal} declares schema, contracts or a created module — every piece another plan could consume belongs in bullet 1, the foundation`);
	}

	if (first && sharedPieces(first.footprint!) > 0 && !first.foundation) {
		throw new HttpError(400, 'bullet 1 holds the pieces other plans could consume — mark it as the foundation');
	}
}

// A republish is a different plan, whatever it is called. Its sign-off goes, and a
// build of the version signed off leaves the line: letting it carry on would build
// something nobody approved. Its branch stays for whoever approves again.
async function withdrawBuild(deps: LineDeps, plan: Plan): Promise<void> {
	const live = await deps.buildRepo.liveForPlan(plan.id);

	if (!live || live.status === 'in_review') {
		return;
	}

	await stopRunningJobs(deps, { build: live });

	const cancelled = await deps.buildRepo.update({
		id: live.id,
		status: 'cancelled',
		failureReason: 'the plan was revised after it was approved — approve it again',
		finishedAt: new Date()
	});

	if (cancelled) {
		removeWorktree(deps, { build: cancelled });
		announceBuild({ socketRegistry: deps.socketRegistry, projectId: plan.projectId, build: cancelled });

		if (live.status !== 'failed') {
			await notifyBuildStatus(deps, { plan, build: cancelled });
		}
	}
}

export async function publishPlan(
	deps: LineDeps,
	opts: {
		id: string;
		machineId: string;
		title: string;
		bodyMd: string;
		acs: PublishAc[];
		slices: PublishSlice[];
	}
): Promise<Plan> {
	const plan = await getMachinePlan({ planRepo: deps.planRepo, id: opts.id, machineId: opts.machineId });

	rejectMalformed({ verifyInUi: plan.verifyInUi, acs: opts.acs, slices: opts.slices });

	const published = await deps.db.transaction(async (tx) => {
		const planRepo = getPlanRepo(tx);
		const updated = await planRepo.update({ id: plan.id, title: opts.title, bodyMd: opts.bodyMd, approvedAt: null });
		const sliceIdByOrdinal = await writeSlices({ sliceRepo: getSliceRepo(tx), idService: deps.idService, planId: plan.id, slices: opts.slices });

		await writeAcs({
			acRepo: getAcRepo(tx),
			idService: deps.idService,
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

	if (plan.approvedAt !== null) {
		await withdrawBuild(deps, plan);
	}

	announcePlan({ socketRegistry: deps.socketRegistry, plan: published });
	await announcePlanArtifact({ socketRegistry: deps.socketRegistry, acRepo: deps.acRepo, sliceRepo: deps.sliceRepo, planId: plan.id });

	return published;
}

// Matched by ordinal so a republish keeps the slice rows a build may already have
// runs against, instead of deleting the bullet out from under them.
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
		const values = {
			kind: slice.kind,
			title: slice.title,
			bodyMd: slice.kind === 'verify' ? null : slice.bodyMd ?? null,
			foundation: slice.foundation,
			footprint: slice.footprint ?? EMPTY_FOOTPRINT
		};

		if (found) {
			await opts.sliceRepo.updateInPlan({ id: found.id, planId: opts.planId, ...values });
			ids.set(slice.ordinal, found.id);

			continue;
		}

		const created = await opts.sliceRepo.create({ id: opts.idService.createSliceId(), planId: opts.planId, ordinal: slice.ordinal, ...values });

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
// republish that reset them would hand a build a criterion it has already met.
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
			await opts.acRepo.updateInPlan({ id: found.id, planId: opts.planId, text: ac.text, ordinal: index + 1, sliceId });

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
