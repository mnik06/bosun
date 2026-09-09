import { HttpError } from 'src/api/errors/HttpError';
import { getMachinePlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlanArtifact } from 'src/controllers/plans/shared/plan-broadcast';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Ac } from 'src/types/PlanSchema';

export async function markPlanAc(opts: {
	planRepo: PlanRepo;
	acRepo: AcRepo;
	sliceRepo: SliceRepo;
	socketRegistry: SocketRegistry;
	id: string;
	machineId: string;
	code: string;
	implemented?: boolean;
	verified?: boolean;
	blockedReason?: string;
}): Promise<Ac> {
	const plan = await getMachinePlan({
		planRepo: opts.planRepo,
		id: opts.id,
		machineId: opts.machineId
	});

	const touchesVerification = opts.verified !== undefined || opts.blockedReason !== undefined;

	if (touchesVerification && !plan.verifyInUi) {
		throw new HttpError(
			400,
			'this plan has UI verification off, so nothing is verified in a browser'
		);
	}

	const marked = await opts.acRepo.markInPlan({
		planId: plan.id,
		code: opts.code,
		...(opts.implemented === undefined ? {} : { implemented: opts.implemented }),
		// Verifying it clears any earlier blocker: whatever stood in the way, the
		// criterion has now been watched holding, and a stale reason beside a green
		// tick reads as a caveat nobody meant.
		...(opts.verified === undefined ? {} : { verified: opts.verified, blockedReason: null }),
		...(opts.blockedReason === undefined ? {} : { blockedReason: opts.blockedReason })
	});

	if (!marked) {
		throw new HttpError(404, `no such acceptance criterion: ${opts.code}`);
	}

	await announcePlanArtifact({
		socketRegistry: opts.socketRegistry,
		acRepo: opts.acRepo,
		sliceRepo: opts.sliceRepo,
		planId: plan.id
	});

	return marked;
}
