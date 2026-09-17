import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AvailableAzureRepositoryListRespSchema,
	AzureConnectionIdParamsSchema,
	AzureConnectionListRespSchema,
	AzureConnectionRespSchema,
	ConnectAzureOrganizationReqSchema,
	RotateAzureConnectionReqSchema
} from 'src/api/routes/schemas/azure/AzureSchemas';
import { connectAzureOrganization } from 'src/controllers/azure/connect-organization';
import { disconnectAzureOrganization } from 'src/controllers/azure/disconnect-organization';
import { listAvailableAzureRepositories } from 'src/controllers/azure/list-available-repositories';
import { listAzureConnections } from 'src/controllers/azure/list-connections';
import { rotateAzureConnection } from 'src/controllers/azure/rotate-connection';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/connections',
		{ schema: { body: ConnectAzureOrganizationReqSchema, response: { 200: AzureConnectionRespSchema } } },
		async (req) => {
			return connectAzureOrganization({
				azureConnectionRepo: fastify.repos.azureConnectionRepo,
				azureDevOps: fastify.services.azureDevOps,
				patEncryption: fastify.services.patEncryption,
				idService: fastify.services.idService,
				userId: req.user!.id,
				projectId: req.membership!.projectId,
				organization: req.body.organization,
				pat: req.body.pat
			});
		}
	);

	fastify.get('/connections', { schema: { response: { 200: AzureConnectionListRespSchema } } }, async (req) => {
		return listAzureConnections({ azureConnectionRepo: fastify.repos.azureConnectionRepo, projectId: req.membership!.projectId });
	});

	fastify.put(
		'/connections/:id',
		{
			schema: {
				params: AzureConnectionIdParamsSchema,
				body: RotateAzureConnectionReqSchema,
				response: { 200: AzureConnectionRespSchema }
			}
		},
		async (req) => {
			return rotateAzureConnection({
				azureConnectionRepo: fastify.repos.azureConnectionRepo,
				azureDevOps: fastify.services.azureDevOps,
				patEncryption: fastify.services.patEncryption,
				id: req.params.id,
				projectId: req.membership!.projectId,
				pat: req.body.pat
			});
		}
	);

	fastify.delete(
		'/connections/:id',
		{ schema: { params: AzureConnectionIdParamsSchema } },
		async (req, reply) => {
			await disconnectAzureOrganization({
				azureConnectionRepo: fastify.repos.azureConnectionRepo,
				azureWebhookSubscriptionRepo: fastify.repos.azureWebhookSubscriptionRepo,
				repositoryRepo: fastify.repos.repositoryRepo,
				machineRepo: fastify.repos.machineRepo,
				azureDevOps: fastify.services.azureDevOps,
				patEncryption: fastify.services.patEncryption,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				projectId: req.membership!.projectId
			});

			return reply.status(204).send(undefined);
		}
	);

	fastify.get('/repositories', { schema: { response: { 200: AvailableAzureRepositoryListRespSchema } } }, async (req) => {
		return listAvailableAzureRepositories({
			azureConnectionRepo: fastify.repos.azureConnectionRepo,
			azureDevOps: fastify.services.azureDevOps,
			patEncryption: fastify.services.patEncryption,
			projectId: req.membership!.projectId
		});
	});
};

export default routes;
