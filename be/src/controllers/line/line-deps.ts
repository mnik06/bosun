import { type FastifyInstance } from 'fastify';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type IntegrationRepo } from 'src/repos/builds/integration.repo';
import { type OverlapDecisionRepo } from 'src/repos/builds/overlap-decision.repo';
import { type PlanAmendmentRepo } from 'src/repos/builds/plan-amendment.repo';
import { type PlanDependencyRepo } from 'src/repos/builds/plan-dependency.repo';
import { type RepositoryMessageRepo } from 'src/repos/builds/repository-message.repo';
import { type SliceRunRepo } from 'src/repos/builds/slice-run.repo';
import { type VerifyFindingRepo } from 'src/repos/builds/verify-finding.repo';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type NotificationRepo } from 'src/repos/notifications/notification.repo';
import { type PushSubscriptionRepo } from 'src/repos/notifications/push-subscription.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type QuickFixRepo } from 'src/repos/quick-fixes/quick-fix.repo';
import { type UserRepo } from 'src/repos/users/user.repo';
import { type Db } from 'src/services/drizzle/drizzle.service';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type IdService } from 'src/services/ids/id.service';
import { type LineLockService } from 'src/services/line/line-lock.service';
import { type WebPushService } from 'src/services/notifications/web-push.service';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type RunActivityService } from 'src/services/runs/run-activity.service';
import { type MachineMemoryService } from 'src/services/sockets/machine-memory.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

// Everything the line touches, in one place because the agent socket, the HTTP
// routes, the webhook and the timers all schedule, and a set assembled four times
// is four sets that can disagree.
export interface LineDeps {
	db: Db;
	buildRepo: BuildRepo;
	sliceRunRepo: SliceRunRepo;
	integrationRepo: IntegrationRepo;
	verifyFindingRepo: VerifyFindingRepo;
	planDependencyRepo: PlanDependencyRepo;
	planAmendmentRepo: PlanAmendmentRepo;
	overlapDecisionRepo: OverlapDecisionRepo;
	repositoryMessageRepo: RepositoryMessageRepo;
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	sliceRepo: SliceRepo;
	acRepo: AcRepo;
	planDecisionRepo: PlanDecisionRepo;
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	onboardingRunRepo: OnboardingRunRepo;
	userRepo: UserRepo;
	projectMemberRepo: ProjectMemberRepo;
	notificationRepo: NotificationRepo;
	pushSubscriptionRepo: PushSubscriptionRepo;
	quickFixRepo: QuickFixRepo;
	idService: IdService;
	githubApp: GithubAppService;
	socketRegistry: SocketRegistry;
	webPush: WebPushService;
	runActivity: RunActivityService;
	machineMemory: MachineMemoryService;
	planTextService: PlanTextService;
	lineLock: LineLockService;
	// The web app's origin: a pull request body links back to its plan, and a push
	// notification deep-links to the same place.
	appUrl: string;
}

export function lineDeps(fastify: FastifyInstance): LineDeps {
	return {
		db: fastify.db,
		buildRepo: fastify.repos.buildRepo,
		sliceRunRepo: fastify.repos.sliceRunRepo,
		integrationRepo: fastify.repos.integrationRepo,
		verifyFindingRepo: fastify.repos.verifyFindingRepo,
		planDependencyRepo: fastify.repos.planDependencyRepo,
		planAmendmentRepo: fastify.repos.planAmendmentRepo,
		overlapDecisionRepo: fastify.repos.overlapDecisionRepo,
		repositoryMessageRepo: fastify.repos.repositoryMessageRepo,
		planRepo: fastify.repos.planRepo,
		planMessageRepo: fastify.repos.planMessageRepo,
		sliceRepo: fastify.repos.sliceRepo,
		acRepo: fastify.repos.acRepo,
		planDecisionRepo: fastify.repos.planDecisionRepo,
		machineRepo: fastify.repos.machineRepo,
		repositoryRepo: fastify.repos.repositoryRepo,
		githubInstallationRepo: fastify.repos.githubInstallationRepo,
		onboardingRunRepo: fastify.repos.onboardingRunRepo,
		userRepo: fastify.repos.userRepo,
		projectMemberRepo: fastify.repos.projectMemberRepo,
		notificationRepo: fastify.repos.notificationRepo,
		pushSubscriptionRepo: fastify.repos.pushSubscriptionRepo,
		quickFixRepo: fastify.repos.quickFixRepo,
		idService: fastify.services.idService,
		githubApp: fastify.services.githubApp,
		socketRegistry: fastify.services.socketRegistry,
		webPush: fastify.services.webPush,
		runActivity: fastify.services.runActivity,
		machineMemory: fastify.services.machineMemory,
		planTextService: fastify.services.planTextService,
		lineLock: fastify.services.lineLock,
		appUrl: fastify.env.PUBLIC_APP_URL
	};
}
