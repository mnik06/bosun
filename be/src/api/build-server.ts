import { getEnv } from 'src/services/env/env.service';
import fastify, { FastifyInstance } from 'fastify';
import autoload from '@fastify/autoload';
import path from 'path';
import crypto from 'crypto';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { errorHandler } from 'src/api/errors/error.handler';
import { startStalePlanSweep } from 'src/controllers/plans/sweep-stale-plans';
import { getLoggerOptions } from 'src/api/plugins/logger.plugin';
import {
	getRequireMembershipHook,
	getRequireProjectParamMembershipHook,
	getRequireUserHook,
	requireAppOwner,
	requireLeader
} from 'src/api/plugins/auth.plugin';
import { getDb } from 'src/services/drizzle/drizzle.service';
import { getServices } from 'src/services/index';
import { getRepos } from 'src/repos/index';
import { type Env } from 'src/types/EnvSchema';

function registerCorePlugins(server: FastifyInstance): void {
	server.register(helmet);
	server.register(compress, { global: true, encodings: ['br', 'gzip'], threshold: 1024 });
	// Any origin, because this API carries no ambient credential: every protected
	// route reads a bearer token the browser attaches deliberately, so a page on
	// another origin has nothing to replay and no CSRF to mount. That holds only
	// while `credentials` stays off — turning it on alongside a wildcard origin
	// would let any site make authenticated requests with the user's cookies.
	server.register(cors, {
		origin: '*',
		credentials: false,
		methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
	});
	server.register(websocket);
}

function decorateContext(server: FastifyInstance, env: Env): void {
	const db = getDb({
		databaseUrl: env.DATABASE_URL,
		logsEnabled: env.NODE_ENV === 'local'
	});
	const repos = getRepos(db);
	const services = getServices({ env });

	server.decorate('db', db);
	server.decorate('env', env);
	server.decorate('repos', repos);
	server.decorate('services', services);

	if (services.agentRelease.misconfigured) {
		server.log.warn(services.agentRelease.misconfigured);
	}
	server.decorate(
		'requireUser',
		getRequireUserHook({
			supabaseAuth: services.supabaseAuth,
			idService: services.idService,
			userRepo: repos.userRepo
		})
	);
	server.decorate(
		'requireMembership',
		getRequireMembershipHook({
			projectRepo: repos.projectRepo,
			projectMemberRepo: repos.projectMemberRepo
		})
	);
	server.decorate(
		'requireProjectParamMembership',
		getRequireProjectParamMembershipHook({
			projectRepo: repos.projectRepo,
			projectMemberRepo: repos.projectMemberRepo
		})
	);
	server.decorate('requireLeader', requireLeader);
	server.decorate('requireAppOwner', requireAppOwner);
}

function registerRoutes(server: FastifyInstance): void {
	server.register(autoload, {
		dir: path.join(__dirname, 'routes'),
		ignoreFilter: 'schemas',
		autoHooks: true,
		cascadeHooks: true,
		routeParams: true
	});
}

export async function buildServer(): Promise<FastifyInstance> {
	// Before anything reads a variable: the server refuses to boot on a bad `.env`
	// rather than failing later at the first request that needs one.
	const env = getEnv();

	const server = fastify({
		genReqId: () => crypto.randomUUID(),
		requestIdHeader: 'x-request-id',
		trustProxy: true,
		logger: getLoggerOptions(env),
		exposeHeadRoutes: false,
		pluginTimeout: 10_000
	});

	registerCorePlugins(server);

	if (['local', 'staging'].includes(env.NODE_ENV)) {
		const { setupSwagger } = await import('src/api/plugins/swagger.plugin');

		await setupSwagger(server);
	}

	server.setErrorHandler(errorHandler);

	server.setNotFoundHandler((_req, reply) => {
		return reply.status(404).send({ message: 'Not found' });
	});

	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);

	decorateContext(server, env);

	registerRoutes(server);

	// Nothing else settles a grill whose machine never comes back: a planning
	// session outlives its socket, so a close reports nothing and the agent's
	// `hello` is what settles the rest.
	const stopSweep = startStalePlanSweep({
		planRepo: server.repos.planRepo,
		planTextService: server.services.planTextService,
		socketRegistry: server.services.socketRegistry,
		log: server.log
	});

	server.addHook('onClose', stopSweep);

	return server;
}
