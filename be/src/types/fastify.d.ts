import type { preValidationAsyncHookHandler } from 'fastify';
import type { Repos } from 'src/repos/index';
import type { Db } from 'src/services/drizzle/drizzle.service';
import type { Services } from 'src/services/index';
import type { Env } from 'src/types/EnvSchema';
import type { Membership } from 'src/types/ProjectSchema';
import type { User } from 'src/types/UserSchema';

declare module 'fastify' {
	interface FastifyInstance {
		db: Db;
		env: Env;
		repos: Repos;
		services: Services;
		requireUser: preValidationAsyncHookHandler;
		requireMembership: preValidationAsyncHookHandler;
		requireProjectParamMembership: preValidationAsyncHookHandler;
		requireLeader: preValidationAsyncHookHandler;
		requireAppOwner: preValidationAsyncHookHandler;
	}

	interface FastifyRequest {
		agent?: { machineId: string; projectId: string };
		uiSession?: { userId: string; projectId: string };
		membership?: Membership;
		user?: User;
	}
}
