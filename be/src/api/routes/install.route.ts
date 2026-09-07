import { FastifyPluginAsync } from 'fastify';

const routes: FastifyPluginAsync = async function (fastify) {
	fastify.get('/install.sh', async (_req, reply) => {
		const script = fastify.services.installerService.getInstallScript({
			serverUrl: fastify.env.PUBLIC_SERVER_URL,
			downloadBaseUrl: fastify.env.AGENT_DOWNLOAD_BASE_URL
		});

		return reply.type('text/x-shellscript; charset=utf-8').send(script);
	});
};

export default routes;
