import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Slice, type SliceKind } from 'src/types/PlanSchema';

// Splitting a tracer bullet is adding an empty one and moving acceptance
// criteria into it, so this creates no ACs of its own — the every-AC-claimed-once
// invariant is unaffected by a bullet that starts out claiming nothing.
export async function createSlice(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	planId: string;
	userId: string;
	title: string;
	kind: SliceKind;
}): Promise<Slice> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.planId,
		userId: opts.userId
	});
	const existing = await opts.sliceRepo.listByPlan(plan.id);
	const created = await opts.sliceRepo.create({
		id: opts.idService.createSliceId(),
		planId: plan.id,
		ordinal: Math.max(0, ...existing.map((slice) => slice.ordinal)) + 1,
		kind: opts.kind,
		title: opts.title,
		bodyMd: null
	});

	await announcePlanArtifact({
		socketRegistry: opts.socketRegistry,
		acRepo: opts.acRepo,
		sliceRepo: opts.sliceRepo,
		planId: plan.id
	});

	return created;
}
