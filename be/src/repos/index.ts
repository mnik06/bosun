import { type getDb } from 'src/services/drizzle/drizzle.service';
import { getMachineRepo } from 'src/repos/machines/machine.repo';

export function getRepos(db: ReturnType<typeof getDb>) {
	return {
		machineRepo: getMachineRepo(db)
	};
}

export type Repos = ReturnType<typeof getRepos>;
