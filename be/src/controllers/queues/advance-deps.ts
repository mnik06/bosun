import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type RunActivityService } from 'src/services/runs/run-activity.service';
import { type MachineMemoryService } from 'src/services/sockets/machine-memory.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

// Everything the scheduler touches, in one place because the agent socket and
// the HTTP routes both advance queues and a set assembled twice is two sets that
// can disagree. Its own file rather than `advance-queue.ts` so the modules that
// only pass it through do not import the scheduler to name its argument.
export interface AdvanceDeps {
	queueRepo: QueueRepo;
	queueItemRepo: QueueItemRepo;
	sliceRunRepo: SliceRunRepo;
	planRepo: PlanRepo;
	sliceRepo: SliceRepo;
	acRepo: AcRepo;
	planBlockerRepo: PlanBlockerRepo;
	planDecisionRepo: PlanDecisionRepo;
	machineRepo: MachineRepo;
	// A repository machine's bullets carry its draft, share its memory with any
	// onboarding run, and have their pull requests opened through the App.
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	onboardingRunRepo: OnboardingRunRepo;
	githubApp: GithubAppService;
	socketRegistry: SocketRegistry;
	runActivity: RunActivityService;
	machineMemory: MachineMemoryService;
	// The web app's origin, carried here because a pull request body links back to
	// the plan it came from and the scheduler is the only place that body is built.
	appUrl: string;
}
