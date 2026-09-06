import type { preValidationAsyncHookHandler } from 'fastify';
import type { Repos } from 'src/repos/index';
import type { getDb } from 'src/services/drizzle/drizzle.service';
import type { User } from 'src/types/UserSchema';

declare module 'fastify' {
	interface FastifyInstance {
		db: ReturnType<typeof getDb>;
		repos: Repos;
		requireUser: preValidationAsyncHookHandler;
	}

	interface FastifyRequest {
		agent?: { machineId: string; userId: string };
		uiUserId?: string;
		user?: User;
	}
}
