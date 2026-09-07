import { FastifyPluginAsync } from 'fastify';

const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
};

export default hooks;
