import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { GitCredentialRespSchema } from 'src/api/routes/schemas/agent/AgentOnboardingSchemas';
import { mintGitCredential } from 'src/controllers/agent/mint-git-credential';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post('/git-credential', { schema: { response: { 200: GitCredentialRespSchema } } }, async (req) => {
		return mintGitCredential({
			machineRepo: fastify.repos.machineRepo,
			repositoryRepo: fastify.repos.repositoryRepo,
			githubInstallationRepo: fastify.repos.githubInstallationRepo,
			githubPatConnectionRepo: fastify.repos.githubPatConnectionRepo,
			azureConnectionRepo: fastify.repos.azureConnectionRepo,
			githubApp: fastify.services.githubApp,
			patEncryption: fastify.services.patEncryption,
			machineId: req.agent!.machineId
		});
	});
};

export default routes;
