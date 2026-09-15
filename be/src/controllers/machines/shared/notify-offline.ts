import { type FastifyInstance } from 'fastify';
import { dispatchNotification, type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { ACTIVE_BUILD_STATUSES } from 'src/types/BuildSchema';
import { type Machine } from 'src/types/MachineSchema';
import { type Plan } from 'src/types/PlanSchema';

export interface MachineOfflineDeps extends DispatchNotificationDeps {
	onboardingRunRepo: OnboardingRunRepo;
	buildRepo: BuildRepo;
	planRepo: PlanRepo;
	projectMemberRepo: ProjectMemberRepo;
	// The web app's origin: a push notification deep-links back to the machine or plan.
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

function planName(plan: Plan): string {
	return plan.title ?? `Plan #${plan.number}`;
}

// A machine going offline is only worth telling anyone about when it was
// holding work nobody else can pick up. Onboarding carries no user
// attribution, so every leader hears about a run stranded mid-way; a build's
// plan creator hears about their own build stopping, the same fallback to
// leaders every other build trigger uses.
export async function notifyMachineOffline(deps: MachineOfflineDeps, opts: { machine: Machine }): Promise<void> {
	const { machine } = opts;
	const [unfinishedOnboarding, activeBuilds] = await Promise.all([
		deps.onboardingRunRepo.listUnfinishedForMachine(machine.id),
		deps.buildRepo.listForMachine({ machineId: machine.id, statuses: ACTIVE_BUILD_STATUSES })
	]);

	if (unfinishedOnboarding.length > 0) {
		await dispatchNotification(deps, {
			recipientIds: await deps.projectMemberRepo.listLeaders(machine.projectId),
			projectId: machine.projectId,
			kind: 'onboarding.machine_offline',
			title: 'Machine went offline',
			body: `${machine.name} went offline during onboarding`,
			url: `${deps.appUrl}/machines/${machine.id}`,
			machineId: machine.id
		});
	}

	for (const build of activeBuilds) {
		const plan = await deps.planRepo.getById(build.planId);

		if (!plan) {
			continue;
		}

		const recipientIds = plan.createdByUserId ? [plan.createdByUserId] : await deps.projectMemberRepo.listLeaders(machine.projectId);

		await dispatchNotification(deps, {
			recipientIds,
			projectId: machine.projectId,
			kind: 'build.machine_offline',
			title: 'Machine went offline',
			body: `${machine.name} went offline while building ${planName(plan)}`,
			url: `${deps.appUrl}/plans/${plan.id}`,
			planId: plan.id,
			machineId: machine.id
		});
	}
}
