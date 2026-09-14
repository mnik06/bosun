import { type FastifyInstance } from 'fastify';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type OnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { type SliceRunRepo } from 'src/repos/queues/slice-run.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type MachineMemoryService } from 'src/services/sockets/machine-memory.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

export interface OnboardingDeps {
	onboardingRunRepo: OnboardingRunRepo;
	repositoryRepo: RepositoryRepo;
	machineRepo: MachineRepo;
	sliceRunRepo: SliceRunRepo;
	idService: IdService;
	machineMemory: MachineMemoryService;
	socketRegistry: SocketRegistry;
}

// Assembled once for the same reason the scheduler's deps are: the browser routes,
// the agent routes and the agent socket all move a run, and must agree on what
// they read.
export function onboardingDeps(fastify: FastifyInstance): OnboardingDeps {
	return {
		onboardingRunRepo: fastify.repos.onboardingRunRepo,
		repositoryRepo: fastify.repos.repositoryRepo,
		machineRepo: fastify.repos.machineRepo,
		sliceRunRepo: fastify.repos.sliceRunRepo,
		idService: fastify.services.idService,
		machineMemory: fastify.services.machineMemory,
		socketRegistry: fastify.services.socketRegistry
	};
}
