import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { type PlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type SliceRepo } from 'src/repos/plans/slice.repo';
import { type QueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type RunActivityService } from 'src/services/runs/run-activity.service';
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
	socketRegistry: SocketRegistry;
	runActivity: RunActivityService;
}
