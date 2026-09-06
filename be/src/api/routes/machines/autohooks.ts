import { FastifyPluginAsync } from 'fastify';

// Applied by @fastify/autoload to every route file in this folder. The owner
// check is not something a new machines route can be added without.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
};

export default hooks;
