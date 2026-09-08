import { type FastifyInstance } from 'fastify';
import { type AskDeps } from 'src/controllers/queues/ask-queue';

export function askDeps(fastify: FastifyInstance): AskDeps {
	return {
		queueRepo: fastify.repos.queueRepo,
		queueItemRepo: fastify.repos.queueItemRepo,
		queueMessageRepo: fastify.repos.queueMessageRepo,
		sliceRunRepo: fastify.repos.sliceRunRepo,
		planRepo: fastify.repos.planRepo,
		sliceRepo: fastify.repos.sliceRepo,
		idService: fastify.services.idService,
		socketRegistry: fastify.services.socketRegistry
	};
}
