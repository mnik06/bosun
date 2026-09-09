import { FastifyPluginAsync } from 'fastify';

// Applied by @fastify/autoload to every route file in this folder. Resolving the
// caller and the project they are acting in is not something a new route here can
// be added without.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireMembership);
};

export default hooks;
