import { FastifyPluginAsync } from 'fastify';

// Every GitHub route connects an installation or reads what one grants, and none
// of that is a developer's to do. The guard sits here rather than per route so a
// new route in this folder cannot be added without it.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireMembership);
	fastify.addHook('preValidation', fastify.requireLeader);
};

export default hooks;
