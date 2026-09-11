import { type FastifyInstance } from 'fastify';
import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';

// One place, because the agent socket and the HTTP routes both advance queues
// and a scheduler assembled twice is two schedulers that can disagree about
// which repositories they are reading.
export function schedulerDeps(fastify: FastifyInstance): AdvanceDeps {
	return {
		queueRepo: fastify.repos.queueRepo,
		queueItemRepo: fastify.repos.queueItemRepo,
		sliceRunRepo: fastify.repos.sliceRunRepo,
		planRepo: fastify.repos.planRepo,
		sliceRepo: fastify.repos.sliceRepo,
		acRepo: fastify.repos.acRepo,
		planBlockerRepo: fastify.repos.planBlockerRepo,
		planDecisionRepo: fastify.repos.planDecisionRepo,
		machineRepo: fastify.repos.machineRepo,
		socketRegistry: fastify.services.socketRegistry,
		runActivity: fastify.services.runActivity,
		appUrl: fastify.env.PUBLIC_APP_URL
	};
}
