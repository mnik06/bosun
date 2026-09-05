import type { Repos } from 'src/repos/index';
import type { getDb } from 'src/services/drizzle/drizzle.service';

declare module 'fastify' {
	interface FastifyInstance {
		db: ReturnType<typeof getDb>;
		repos: Repos;
	}

	interface FastifyRequest {
		machineId?: string;
	}
}
