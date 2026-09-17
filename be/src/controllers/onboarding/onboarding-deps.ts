import { type FastifyInstance } from 'fastify';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type NotificationRepo } from 'src/repos/notifications/notification.repo';
import { type PushSubscriptionRepo } from 'src/repos/notifications/push-subscription.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type QuickFixRepo } from 'src/repos/quick-fixes/quick-fix.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type WebPushService } from 'src/services/notifications/web-push.service';
import { type MachineMemoryService } from 'src/services/sockets/machine-memory.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

export interface OnboardingDeps {
	onboardingRunRepo: OnboardingRunRepo;
	repositoryRepo: RepositoryRepo;
	machineRepo: MachineRepo;
	buildRepo: BuildRepo;
	projectMemberRepo: ProjectMemberRepo;
	notificationRepo: NotificationRepo;
	pushSubscriptionRepo: PushSubscriptionRepo;
	quickFixRepo: QuickFixRepo;
	idService: IdService;
	machineMemory: MachineMemoryService;
	socketRegistry: SocketRegistry;
	webPush: WebPushService;
	// The web app's origin: a push notification deep-links back to the machine.
	appUrl: string;
}

// Assembled once for the same reason the scheduler's deps are: the browser routes,
// the agent routes and the agent socket all move a run, and must agree on what
// they read.
export function onboardingDeps(fastify: FastifyInstance): OnboardingDeps {
	return {
		onboardingRunRepo: fastify.repos.onboardingRunRepo,
		repositoryRepo: fastify.repos.repositoryRepo,
		machineRepo: fastify.repos.machineRepo,
		buildRepo: fastify.repos.buildRepo,
		projectMemberRepo: fastify.repos.projectMemberRepo,
		notificationRepo: fastify.repos.notificationRepo,
		pushSubscriptionRepo: fastify.repos.pushSubscriptionRepo,
		quickFixRepo: fastify.repos.quickFixRepo,
		idService: fastify.services.idService,
		machineMemory: fastify.services.machineMemory,
		socketRegistry: fastify.services.socketRegistry,
		webPush: fastify.services.webPush,
		appUrl: fastify.env.PUBLIC_APP_URL
	};
}
