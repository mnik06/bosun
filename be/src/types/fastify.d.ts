import type { preValidationAsyncHookHandler } from 'fastify';
import type { Repos } from 'src/repos/index';
import type { Db } from 'src/services/drizzle/drizzle.service';
import type { Services } from 'src/services/index';
import type { Env } from 'src/types/EnvSchema';
import type { User } from 'src/types/UserSchema';

declare module 'fastify' {
	interface FastifyInstance {
		db: Db;
		env: Env;
		repos: Repos;
		services: Services;
		requireUser: preValidationAsyncHookHandler;
	}

	interface FastifyRequest {
		agent?: { machineId: string; userId: string };
		uiUserId?: string;
		user?: User;
	}
}
