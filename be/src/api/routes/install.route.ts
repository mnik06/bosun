import { FastifyPluginAsync } from 'fastify';

const routes: FastifyPluginAsync = async function (fastify) {
	fastify.get('/install.sh', async (_req, reply) => {
		const release = fastify.services.agentRelease;
		// A fresh install lands on the same build a Refresh would upgrade to, so a
		// machine enrolled today is not immediately offered a different one.
		const version = await release.currentVersion();
		const script = fastify.services.installerService.getInstallScript({
			serverUrl: fastify.env.PUBLIC_SERVER_URL,
			downloadBaseUrl: release.downloadBaseFor(version ?? 'latest')
		});

		return reply.type('text/x-shellscript; charset=utf-8').send(script);
	});
};

export default routes;
