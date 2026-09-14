import { FastifyPluginAsync } from 'fastify';

// Applied by @fastify/autoload to every route file in this folder. Moving a plan
// through the line is a member's to do, in the project the build belongs to.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireMembership);
};

export default hooks;
