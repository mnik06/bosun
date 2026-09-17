import { FastifyPluginAsync } from 'fastify';

// Every Azure route connects, rotates or disconnects an organization, or reads
// what one grants — the same leader-only bar `/github` holds, for the same
// reason: a developer should not be able to hand a machine a new credential.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireMembership);
	fastify.addHook('preValidation', fastify.requireLeader);
};

export default hooks;
