import { type FastifyInstance } from 'fastify';
import { dispatchNotification, type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type Machine } from 'src/types/MachineSchema';

export interface MachineOnlineDeps extends DispatchNotificationDeps {
	onboardingRunRepo: OnboardingRunRepo;
	buildRepo: BuildRepo;
	planRepo: PlanRepo;
	projectMemberRepo: ProjectMemberRepo;
	// The web app's origin: a push notification deep-links back to the machine.
	appUrl: string;
}

export function machineOnlineDeps(fastify: FastifyInstance): MachineOnlineDeps {
	return {
		onboardingRunRepo: fastify.repos.onboardingRunRepo,
		buildRepo: fastify.repos.buildRepo,
		planRepo: fastify.repos.planRepo,
		projectMemberRepo: fastify.repos.projectMemberRepo,
		notificationRepo: fastify.repos.notificationRepo,
		pushSubscriptionRepo: fastify.repos.pushSubscriptionRepo,
		socketRegistry: fastify.services.socketRegistry,
		webPush: fastify.services.webPush,
		idService: fastify.services.idService,
		appUrl: fastify.env.PUBLIC_APP_URL
	};
}

function countLabel(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

// A machine coming back online is only worth telling anyone about when the
// outage actually stranded something on it: a build this reconnect's
// reconciliation held for a system reason (not a person's own pause), or an
// onboarding run nothing finished. Same fan-out rule as the offline side —
// everyone it affects hears about it exactly once.
export async function notifyMachineOnline(
	deps: MachineOnlineDeps,
	opts: { machine: Machine }
): Promise<void> {
	const { machine } = opts;
	const [unfinishedOnboarding, heldBuilds] = await Promise.all([
		deps.onboardingRunRepo.listUnfinishedForMachine(machine.id),
		deps.buildRepo.listForMachine({ machineId: machine.id, statuses: ['held'] })
	]);
	// `held` with no failure reason is a person's own pause, unrelated to this
	// outage; only the reasons the reconciliation itself writes count.
	const strandedBuilds = heldBuilds.filter((build) => build.failureReason !== null);

	if (unfinishedOnboarding.length === 0 && strandedBuilds.length === 0) {
		return;
	}

	const planIds = [...new Set(strandedBuilds.map((build) => build.planId))];
	const plans = await deps.planRepo.listByIds(planIds);
	const planById = new Map(plans.map((plan) => [plan.id, plan]));

	const needsLeaders =
		unfinishedOnboarding.length > 0 ||
		strandedBuilds.some((build) => !planById.get(build.planId)?.createdByUserId);
	const leaderIds = needsLeaders
		? await deps.projectMemberRepo.listLeaders(machine.projectId)
		: [];

	const recipientIds = new Set<string>();

	if (unfinishedOnboarding.length > 0) {
		leaderIds.forEach((id) => recipientIds.add(id));
	}

	for (const build of strandedBuilds) {
		const createdByUserId = planById.get(build.planId)?.createdByUserId;
		const forBuild = createdByUserId ? [createdByUserId] : leaderIds;

		forBuild.forEach((id) => recipientIds.add(id));
	}

	if (recipientIds.size === 0) {
		return;
	}

	await dispatchNotification(deps, {
		recipientIds: [...recipientIds],
		projectId: machine.projectId,
		kind: 'machine.online',
		title: 'Machine back online',
		body: `${machine.name} is back online — ${countLabel(strandedBuilds.length, 'build')} and ${countLabel(unfinishedOnboarding.length, 'onboarding run')} waiting`,
		url: `${deps.appUrl}/machines/${machine.id}`,
		planId: null,
		machineId: machine.id
	});
}
