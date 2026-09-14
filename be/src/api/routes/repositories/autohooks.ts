import { FastifyPluginAsync } from 'fastify';

// Listing stays open to developers — the plan and queue pickers name a machine by
// its repository — and every route that changes anything adds `requireLeader`.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireMembership);
};

export default hooks;
