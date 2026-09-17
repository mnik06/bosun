import { type FastifyInstance } from 'fastify';
import { type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type Build } from 'src/types/BuildSchema';
import { type Machine } from 'src/types/MachineSchema';
import { type OnboardingRun } from 'src/types/OnboardingSchema';

export interface MachineConnectivityDeps extends DispatchNotificationDeps {
	onboardingRunRepo: OnboardingRunRepo;
	buildRepo: BuildRepo;
	planRepo: PlanRepo;
	projectMemberRepo: ProjectMemberRepo;
	// The web app's origin: a push notification deep-links back to the machine.
	appUrl: string;
}

export function machineConnectivityDeps(fastify: FastifyInstance): MachineConnectivityDeps {
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

// A build's plan creator hears about their own build; onboarding carries no
// user attribution, so every leader hears about a stranded run — the same
// fallback a build without a creator uses too.
export async function resolveConnectivityRecipients(
	deps: MachineConnectivityDeps,
	opts: { machine: Machine; unfinishedOnboarding: OnboardingRun[]; affectedBuilds: Build[] }
): Promise<string[]> {
	const { machine, unfinishedOnboarding, affectedBuilds } = opts;
	const planIds = [...new Set(affectedBuilds.map((build) => build.planId))];
	const plans = await deps.planRepo.listByIds(planIds);
	const planById = new Map(plans.map((plan) => [plan.id, plan]));

	const needsLeaders =
		unfinishedOnboarding.length > 0 || affectedBuilds.some((build) => !planById.get(build.planId)?.createdByUserId);
	const leaderIds = needsLeaders ? await deps.projectMemberRepo.listLeaders(machine.projectId) : [];

	const recipientIds = new Set<string>();

	if (unfinishedOnboarding.length > 0) {
		leaderIds.forEach((id) => recipientIds.add(id));
	}

	for (const build of affectedBuilds) {
		const createdByUserId = planById.get(build.planId)?.createdByUserId;
		const forBuild = createdByUserId ? [createdByUserId] : leaderIds;

		forBuild.forEach((id) => recipientIds.add(id));
	}

	return [...recipientIds];
}
