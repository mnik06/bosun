import { FastifyPluginAsync } from 'fastify';

// Applied by @fastify/autoload to every route file in this folder. A push
// subscription has no project of its own — it covers every project the person
// belongs to — so only the caller's identity is resolved here, never a
// membership.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
};

export default hooks;
