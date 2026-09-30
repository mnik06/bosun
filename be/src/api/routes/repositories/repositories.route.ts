import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	RepositoryConfigRespSchema,
	RepositoryIdParamsSchema,
	RepositoryListRespSchema,
	RepositoryRespSchema,
	SaveConfigReqSchema
} from 'src/api/routes/schemas/repositories/RepositorySchemas';
import { getRepositoryConfig } from 'src/controllers/repositories/get-repository-config';
import { listRepositories } from 'src/controllers/repositories/list-repositories';
import { saveConfig } from 'src/controllers/repositories/save-config';

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
		'/:id/config',
		{
			preValidation: fastify.requireLeader,
			schema: { params: RepositoryIdParamsSchema, body: SaveConfigReqSchema, response: { 200: RepositoryRespSchema } }
		},
		async (req) => {
			const repository = await saveConfig({
				repositoryRepo: fastify.repos.repositoryRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				projectId: req.membership!.projectId,
				text: req.body.text
			});

			return { repository };
		}
	);
};

export default routes;
