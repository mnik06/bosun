import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UpdateRepositoryReqSchema } from 'src/api/routes/schemas/line/LineSchemas';
import {
	RepositoryConfigRespSchema,
	RepositoryIdParamsSchema,
	RepositoryListRespSchema,
	RepositoryRespSchema,
	SaveConfigReqSchema
} from 'src/api/routes/schemas/repositories/RepositorySchemas';
import { getRepositoryConfig } from 'src/controllers/repositories/get-repository-config';
import { listRepositories } from 'src/controllers/repositories/list-repositories';
import { saveAutoResolve } from 'src/controllers/repositories/save-auto-resolve';
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

	fastify.patch(
		'/:id',
		{
			preValidation: fastify.requireLeader,
			schema: { params: RepositoryIdParamsSchema, body: UpdateRepositoryReqSchema, response: { 200: RepositoryRespSchema } }
		},
		async (req) => {
			const repository = await saveAutoResolve({
				repositoryRepo: fastify.repos.repositoryRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				projectId: req.membership!.projectId,
				autoResolveConflicts: req.body.autoResolveConflicts
			});

			return { repository };
		}
	);
};

export default routes;
