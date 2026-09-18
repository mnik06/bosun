import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	RepositoryIdParamsSchema,
	RepositoryRespSchema,
	SaveDefaultBranchReqSchema
} from 'src/api/routes/schemas/repositories/RepositorySchemas';
import { onboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { saveDefaultBranch } from 'src/controllers/repositories/save-default-branch';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.put(
		'/:id/default-branch',
		{
			preValidation: fastify.requireLeader,
			schema: { params: RepositoryIdParamsSchema, body: SaveDefaultBranchReqSchema, response: { 200: RepositoryRespSchema } }
		},
		async (req) => {
			const repository = await saveDefaultBranch(
				{
					...onboardingDeps(fastify),
					githubInstallationRepo: fastify.repos.githubInstallationRepo,
					azureConnectionRepo: fastify.repos.azureConnectionRepo,
					githubApp: fastify.services.githubApp
				},
				{ id: req.params.id, projectId: req.membership!.projectId, branch: req.body.branch }
			);

			return { repository };
		}
	);
};

export default routes;
