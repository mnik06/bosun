import { type getDb } from 'src/services/drizzle/drizzle.service';
import { getMachineRepo } from 'src/repos/machines/machine.repo';
import { getAcRepo } from 'src/repos/plans/ac.repo';
import { getPlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { getPlanRepo } from 'src/repos/plans/plan.repo';
import { getSliceRepo } from 'src/repos/plans/slice.repo';
import { getUserRepo } from 'src/repos/users/user.repo';

export function getRepos(db: ReturnType<typeof getDb>) {
	return {
		acRepo: getAcRepo(db),
		machineRepo: getMachineRepo(db),
		planMessageRepo: getPlanMessageRepo(db),
		planRepo: getPlanRepo(db),
		sliceRepo: getSliceRepo(db),
		userRepo: getUserRepo(db)
	};
}

export type Repos = ReturnType<typeof getRepos>;
