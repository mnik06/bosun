import { FastifyPluginAsync } from 'fastify';

// Applied by @fastify/autoload to every route file in this folder.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireMembership);
};

export default hooks;
