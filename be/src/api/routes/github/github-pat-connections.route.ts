import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	ConnectGithubPatConnectionReqSchema,
	GithubPatConnectionIdParamsSchema,
	GithubPatConnectionListRespSchema,
	GithubPatConnectionRespSchema,
	RotateGithubPatConnectionReqSchema
} from 'src/api/routes/schemas/github/GithubSchemas';
import { connectGithubPatConnection } from 'src/controllers/github/connect-pat-connection';
import { disconnectGithubPatConnection } from 'src/controllers/github/disconnect-pat-connection';
import { listGithubPatConnections } from 'src/controllers/github/list-pat-connections';
import { rotateGithubPatConnection } from 'src/controllers/github/rotate-pat-connection';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/pat-connections',
		{ schema: { body: ConnectGithubPatConnectionReqSchema, response: { 201: GithubPatConnectionRespSchema } } },
		async (req, reply) => {
			const connection = await connectGithubPatConnection({
				githubPatConnectionRepo: fastify.repos.githubPatConnectionRepo,
				githubPat: fastify.services.githubPat,
				patEncryption: fastify.services.patEncryption,
				idService: fastify.services.idService,
				userId: req.user!.id,
				projectId: req.membership!.projectId,
				pat: req.body.pat
			});

			return reply.status(201).send(connection);
		}
	);

	fastify.get('/pat-connections', { schema: { response: { 200: GithubPatConnectionListRespSchema } } }, async (req) => {
		return listGithubPatConnections({ githubPatConnectionRepo: fastify.repos.githubPatConnectionRepo, projectId: req.membership!.projectId });
	});

	fastify.put(
		'/pat-connections/:id',
		{
			schema: {
				params: GithubPatConnectionIdParamsSchema,
				body: RotateGithubPatConnectionReqSchema,
				response: { 200: GithubPatConnectionRespSchema }
			}
		},
		async (req) => {
			return rotateGithubPatConnection({
				githubPatConnectionRepo: fastify.repos.githubPatConnectionRepo,
				githubPat: fastify.services.githubPat,
				patEncryption: fastify.services.patEncryption,
				id: req.params.id,
				projectId: req.membership!.projectId,
				pat: req.body.pat
			});
		}
	);

	fastify.delete('/pat-connections/:id', { schema: { params: GithubPatConnectionIdParamsSchema } }, async (req, reply) => {
		await disconnectGithubPatConnection({
			githubPatConnectionRepo: fastify.repos.githubPatConnectionRepo,
			repositoryRepo: fastify.repos.repositoryRepo,
			machineRepo: fastify.repos.machineRepo,
			socketRegistry: fastify.services.socketRegistry,
			id: req.params.id,
			projectId: req.membership!.projectId
		});

		return reply.status(204).send(undefined);
	});
};

export default routes;
