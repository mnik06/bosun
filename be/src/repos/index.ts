import { type getDb } from 'src/services/drizzle/drizzle.service';
import { getMachineRepo } from 'src/repos/machines/machine.repo';
import { getAcRepo } from 'src/repos/plans/ac.repo';
import { getPlanBlockerRepo } from 'src/repos/plans/plan-blocker.repo';
import { getPlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { getPlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { getPlanRepo } from 'src/repos/plans/plan.repo';
import { getProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { getProjectRepo } from 'src/repos/projects/project.repo';
import { getSliceRepo } from 'src/repos/plans/slice.repo';
import { getQueueItemRepo } from 'src/repos/queues/queue-item.repo';
import { getQueueMessageRepo } from 'src/repos/queues/queue-message.repo';
import { getQueueRepo } from 'src/repos/queues/queue.repo';
import { getSliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { getUserRepo } from 'src/repos/users/user.repo';

export function getRepos(db: ReturnType<typeof getDb>) {
	return {
		acRepo: getAcRepo(db),
		machineRepo: getMachineRepo(db),
		planBlockerRepo: getPlanBlockerRepo(db),
		planDecisionRepo: getPlanDecisionRepo(db),
		planMessageRepo: getPlanMessageRepo(db),
		planRepo: getPlanRepo(db),
		projectMemberRepo: getProjectMemberRepo(db),
		projectRepo: getProjectRepo(db),
		queueItemRepo: getQueueItemRepo(db),
		queueMessageRepo: getQueueMessageRepo(db),
		queueRepo: getQueueRepo(db),
		sliceRunRepo: getSliceRunRepo(db),
		sliceRepo: getSliceRepo(db),
		userRepo: getUserRepo(db)
	};
}

export type Repos = ReturnType<typeof getRepos>;
