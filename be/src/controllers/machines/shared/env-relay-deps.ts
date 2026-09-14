import { type FastifyInstance } from 'fastify';
import { type EnvRelayDeps } from 'src/controllers/machines/shared/relay-env-frame';

export function envRelayDeps(fastify: FastifyInstance): EnvRelayDeps {
	return {
		machineRepo: fastify.repos.machineRepo,
		socketRegistry: fastify.services.socketRegistry,
		idService: fastify.services.idService,
		pendingEnvRequests: fastify.services.pendingEnvRequests
	};
}
