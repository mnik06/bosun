import { type FastifyInstance } from 'fastify';
import { dispatchNotification, type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { ACTIVE_BUILD_STATUSES, type BuildStatus } from 'src/types/BuildSchema';
import { type Machine } from 'src/types/MachineSchema';

export interface MachineOfflineDeps extends DispatchNotificationDeps {
	onboardingRunRepo: OnboardingRunRepo;
	buildRepo: BuildRepo;
	planRepo: PlanRepo;
	projectMemberRepo: ProjectMemberRepo;
	// The web app's origin: a push notification deep-links back to the machine.
	appUrl: string;
}

export function machineOfflineDeps(fastify: FastifyInstance): MachineOfflineDeps {
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

// A build queued (`scheduled`) or deliberately paused (`held`) was not actually
// interrupted by this machine dropping — only a build that was mid-session was.
const DISRUPTED_BUILD_STATUSES: BuildStatus[] = ACTIVE_BUILD_STATUSES.filter(
	(status) => status !== 'scheduled' && status !== 'held'
);

function countLabel(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

// A machine going offline is only worth telling anyone about when it was
// holding work nobody else can pick up, and everyone it affects hears about it
// exactly once — never once per build and once more per onboarding run.
// Onboarding carries no user attribution, so every leader hears about a run
// stranded mid-way; a build's plan creator hears about their own build
// stopping, the same fallback to leaders every other build trigger uses.
export async function notifyMachineOffline(
	deps: MachineOfflineDeps,
	opts: { machine: Machine }
): Promise<void> {
	const { machine } = opts;
	const [unfinishedOnboarding, disruptedBuilds] = await Promise.all([
		deps.onboardingRunRepo.listUnfinishedForMachine(machine.id),
		deps.buildRepo.listForMachine({ machineId: machine.id, statuses: DISRUPTED_BUILD_STATUSES })
	]);

	if (unfinishedOnboarding.length === 0 && disruptedBuilds.length === 0) {
		return;
	}

	const planIds = [...new Set(disruptedBuilds.map((build) => build.planId))];
	const plans = await deps.planRepo.listByIds(planIds);
	const planById = new Map(plans.map((plan) => [plan.id, plan]));

	const needsLeaders =
		unfinishedOnboarding.length > 0 ||
		disruptedBuilds.some((build) => !planById.get(build.planId)?.createdByUserId);
	const leaderIds = needsLeaders
		? await deps.projectMemberRepo.listLeaders(machine.projectId)
		: [];

	const recipientIds = new Set<string>();

	if (unfinishedOnboarding.length > 0) {
		leaderIds.forEach((id) => recipientIds.add(id));
	}

	for (const build of disruptedBuilds) {
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
		kind: 'machine.offline',
		title: 'Machine went offline',
		body: `${machine.name} went offline — ${countLabel(disruptedBuilds.length, 'build')} and ${countLabel(unfinishedOnboarding.length, 'onboarding run')} interrupted`,
		url: `${deps.appUrl}/machines/${machine.id}`,
		planId: null,
		machineId: machine.id
	});
}
