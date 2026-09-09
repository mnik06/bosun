import { FastifyPluginAsync } from 'fastify';

// These routes address a project by path rather than acting inside one, so
// membership is resolved from the param rather than from the header every other
// route uses. Listing and creating have no param and fall through to their own
// gate.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireProjectParamMembership);
};

export default hooks;
