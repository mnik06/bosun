import 'src/services/env/env.service';
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
import { getLoggerOptions } from 'src/api/plugins/logger.plugin';
import { getDb } from 'src/services/drizzle/drizzle.service';
import { getRepos } from 'src/repos/index';

function registerCorePlugins(server: FastifyInstance): void {
	server.register(helmet);
	server.register(compress, { global: true, encodings: ['br', 'gzip'], threshold: 1024 });
	server.register(cors, {
		methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
	});
	server.register(websocket);
}

function decorateContext(server: FastifyInstance): void {
	const db = getDb({
		databaseUrl: process.env.DATABASE_URL!,
		logsEnabled: process.env.NODE_ENV === 'local'
	});

	server.decorate('db', db);
	server.decorate('repos', getRepos(db));
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
	const server = fastify({
		genReqId: () => crypto.randomUUID(),
		requestIdHeader: 'x-request-id',
		trustProxy: true,
		logger: getLoggerOptions(),
		exposeHeadRoutes: false,
		pluginTimeout: 10_000
	});

	registerCorePlugins(server);

	if (['local', 'staging'].includes(process.env.NODE_ENV!)) {
		const { setupSwagger } = await import('src/api/plugins/swagger.plugin');

		await setupSwagger(server);
	}

	server.setErrorHandler(errorHandler);

	server.setNotFoundHandler((_req, reply) => {
		return reply.status(404).send({ message: 'Not found' });
	});

	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);

	decorateContext(server);

	registerRoutes(server);

	return server;
}
