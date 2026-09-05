import { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export async function setupSwagger(server: FastifyInstance) {
	await server.register(fastifySwagger, {
		openapi: {
			info: {
				title: 'bosun-be',
				description: 'Bosun backend API',
				version: '1.0.0'
			},
			servers: []
		},
		transform: jsonSchemaTransform
	});
	await server.register(fastifySwaggerUI, {
		routePrefix: '/api/documentation',
		logLevel: 'silent'
	});
}
