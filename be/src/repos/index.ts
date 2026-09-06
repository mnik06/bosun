import { type getDb } from 'src/services/drizzle/drizzle.service';
import { getMachineRepo } from 'src/repos/machines/machine.repo';
import { getUserRepo } from 'src/repos/users/user.repo';

export function getRepos(db: ReturnType<typeof getDb>) {
	return {
		machineRepo: getMachineRepo(db),
		userRepo: getUserRepo(db)
	};
}

export type Repos = ReturnType<typeof getRepos>;
