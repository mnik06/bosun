import { HttpError } from 'src/api/errors/HttpError';
import {
	decodeChatAttachments,
	requireAttachmentReader,
	storeChatAttachments,
	userTurnContent,
	type ChatAttachmentUpload
} from 'src/controllers/plans/shared/chat-attachments';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { announcePlan, announcePlanMessage } from 'src/controllers/plans/shared/plan-broadcast';
import { configDraftFor } from 'src/controllers/repositories/shared/config-draft';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type ChatAttachmentRepo } from 'src/repos/plans/chat-attachment.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type PlanSnapshot } from 'src/types/plan-frames';
import { type Ac, type Plan, type Slice } from 'src/types/PlanSchema';

function planSnapshot(opts: { plan: Plan; acs: Ac[]; slices: Slice[] }): PlanSnapshot {
	const ordinalOf = new Map(opts.slices.map((slice) => [slice.id, slice.ordinal]));

	return {
		verifyInUi: opts.plan.verifyInUi,
		auto: opts.plan.auto,
		title: opts.plan.title,
		bodyMd: opts.plan.bodyMd,
		acs: opts.acs.map((ac) => ({
			code: ac.code,
			text: ac.text,
			sliceOrdinal: ac.sliceId === null ? null : ordinalOf.get(ac.sliceId) ?? null
		})),
		slices: opts.slices.map((slice) => ({
			ordinal: slice.ordinal,
			kind: slice.kind,
			title: slice.title,
			bodyMd: slice.bodyMd,
			foundation: slice.foundation,
			footprint: slice.footprint
		}))
	};
}

// The transcript is written before the frame goes out, so a line the person
// typed survives an agent that drops it. The machine is checked first for the
// opposite reason: a message nothing can act on should be refused at the button
// rather than land in a transcript nobody is reading.
export async function sayToPlan(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	acRepo: AcRepo;
	chatAttachmentRepo: ChatAttachmentRepo;
	sliceRepo: SliceRepo;
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	text: string;
	attachments: ChatAttachmentUpload[];
}): Promise<void> {
	const plan = await getOwnedPlan({
		planRepo: opts.planRepo,
		id: opts.id,
		projectId: opts.projectId
	});

	const files = decodeChatAttachments(opts.attachments);

	if (!opts.socketRegistry.getAgentSocket(plan.machineId)) {
		throw new HttpError(409, 'this machine is offline');
	}

	await requireAttachmentReader({ machineRepo: opts.machineRepo, machineId: plan.machineId, files });

	const attachments = await storeChatAttachments({
		chatAttachmentRepo: opts.chatAttachmentRepo,
		idService: opts.idService,
		planId: plan.id,
		files
	});
	const message = await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: plan.id,
		role: 'user',
		content: userTurnContent({ text: opts.text, attachments })
	});

	announcePlanMessage({
		socketRegistry: opts.socketRegistry,
		planId: plan.id,
		message
	});

	// Back to planning even when the plan was ready: what the person just asked
	// for may rewrite it, and a plan that says "ready" while a session is editing
	// it is one somebody approves mid-revision.
	if (plan.status !== 'planning') {
		const updated = await opts.planRepo.update({
			id: plan.id,
			status: 'planning',
			failureReason: null
		});

		if (updated) {
			announcePlan({ socketRegistry: opts.socketRegistry, plan: updated });
		}
	}

	const [acs, slices, machine] = await Promise.all([
		opts.acRepo.listByPlan(plan.id),
		opts.sliceRepo.listByPlan(plan.id),
		opts.machineRepo.getById(plan.machineId)
	]);
	const configDraft = await configDraftFor({ repositoryRepo: opts.repositoryRepo, machine });

	opts.socketRegistry.sendToAgent({
		machineId: plan.machineId,
		message: {
			type: 'plan.say',
			planId: plan.id,
			text: opts.text,
			attachments,
			notes: machine?.projectProfile?.notes ?? null,
			configDraft,
			plan: planSnapshot({ plan, acs, slices })
		}
	});
}
