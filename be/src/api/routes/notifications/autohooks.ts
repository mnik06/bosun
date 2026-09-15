import { FastifyPluginAsync } from 'fastify';

// Applied by @fastify/autoload to every route file in this folder. Only the
// caller's identity is resolved here — marking a single notification read needs
// no project context, so membership is added per-route below rather than here.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
};

export default hooks;
