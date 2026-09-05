import { FastifyPluginAsync } from 'fastify';
import { getInstallScript } from 'src/services/installer/installer.service';

const routes: FastifyPluginAsync = async function (fastify) {
	fastify.get('/install.sh', async (_req, reply) => {
		const script = getInstallScript({
			serverUrl: process.env.PUBLIC_SERVER_URL!,
			downloadBaseUrl: process.env.AGENT_DOWNLOAD_BASE_URL!
		});

		return reply.type('text/x-shellscript; charset=utf-8').send(script);
	});
};

export default routes;
