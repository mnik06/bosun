import { FastifyPluginAsync } from 'fastify';
import { authenticateAgent } from 'src/controllers/agent/authenticate-agent';

// Applied by @fastify/autoload to every route file in this folder — the socket
// and the session's tool writes alike. The machine key is the only credential
// these routes accept, and it is not something a new agent route can be added
// without.
const hooks: FastifyPluginAsync = async function (fastify) {
	fastify.addHook('preValidation', async (request, reply) => {
		const agent = await authenticateAgent({
			machineRepo: fastify.repos.machineRepo,
			keyService: fastify.services.keyService,
			authorization: request.headers.authorization
		});

		if (!agent) {
			return reply.status(401).send({ message: 'Unauthorized' });
		}

		request.agent = agent;
	});
};

export default hooks;
