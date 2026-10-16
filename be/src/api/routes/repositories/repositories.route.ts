import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	RepositoryConfigRespSchema,
	RepositoryIdParamsSchema,
	RepositoryListRespSchema,
	SaveInstructionsReqSchema,
	SaveInstructionsRespSchema
} from 'src/api/routes/schemas/repositories/RepositorySchemas';
import { getRepositoryConfig } from 'src/controllers/repositories/get-repository-config';
import { onboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { listRepositories } from 'src/controllers/repositories/list-repositories';
import { saveInstructions } from 'src/controllers/repositories/save-instructions';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get('/', { schema: { response: { 200: RepositoryListRespSchema } } }, async (req) => {
		return listRepositories({ repositoryRepo: fastify.repos.repositoryRepo, projectId: req.membership!.projectId });
	});

	fastify.get(
		'/:id/config',
		{
			preValidation: fastify.requireLeader,
			schema: { params: RepositoryIdParamsSchema, response: { 200: RepositoryConfigRespSchema } }
		},
		async (req) => {
			return getRepositoryConfig({
				repositoryRepo: fastify.repos.repositoryRepo,
				id: req.params.id,
				projectId: req.membership!.projectId
			});
		}
	);

	fastify.put(
		'/:id/instructions',
		{
			preValidation: fastify.requireLeader,
			schema: { params: RepositoryIdParamsSchema, body: SaveInstructionsReqSchema, response: { 200: SaveInstructionsRespSchema } }
		},
		async (req) => {
			return saveInstructions(onboardingDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId, text: req.body.text });
		}
	);
};

export default routes;
