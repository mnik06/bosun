import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	ProjectIdParamsSchema,
	ProjectNameReqSchema
} from 'src/api/routes/schemas/projects/ProjectReqSchemas';
import { ProjectListRespSchema } from 'src/api/routes/schemas/projects/ProjectRespSchemas';
import { createProject } from 'src/controllers/projects/create-project';
import { deleteProject } from 'src/controllers/projects/delete-project';
import { listProjects } from 'src/controllers/projects/list-projects';
import { renameProject } from 'src/controllers/projects/rename-project';
import { ProjectSchema } from 'src/types/ProjectSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get('/', { schema: { response: { 200: ProjectListRespSchema } } }, async (req) => {
		return listProjects({ projectRepo: fastify.repos.projectRepo, user: req.user! });
	});

	fastify.post(
		'/',
		{
			preValidation: fastify.requireAppOwner,
			schema: { body: ProjectNameReqSchema, response: { 201: ProjectSchema } }
		},
		async (req, reply) => {
			const project = await createProject({
				projectRepo: fastify.repos.projectRepo,
				idService: fastify.services.idService,
				name: req.body.name
			});

			return reply.status(201).send(project);
		}
	);

	fastify.patch(
		'/:projectId',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: ProjectIdParamsSchema,
				body: ProjectNameReqSchema,
				response: { 200: ProjectSchema }
			}
		},
		async (req) => {
			return renameProject({
				projectRepo: fastify.repos.projectRepo,
				id: req.params.projectId,
				name: req.body.name
			});
		}
	);

	fastify.delete(
		'/:projectId',
		{
			preValidation: fastify.requireAppOwner,
			schema: { params: ProjectIdParamsSchema }
		},
		async (req, reply) => {
			await deleteProject({
				projectRepo: fastify.repos.projectRepo,
				id: req.params.projectId
			});

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
