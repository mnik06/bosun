import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DeleteEnvSetQuerySchema } from 'src/api/routes/schemas/machines/DeleteEnvSetQuerySchema';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import { SaveEnvSetReqSchema } from 'src/api/routes/schemas/machines/SaveEnvSetReqSchema';
import { deleteEnvSet } from 'src/controllers/machines/delete-env-set';
import { saveEnvSet } from 'src/controllers/machines/save-env-set';
import { type EnvRelayDeps } from 'src/controllers/machines/shared/relay-env-frame';
import { MachineSchema } from 'src/types/MachineSchema';

function envRelayDeps(fastify: FastifyInstance): EnvRelayDeps {
	return {
		machineRepo: fastify.repos.machineRepo,
		socketRegistry: fastify.services.socketRegistry,
		idService: fastify.services.idService,
		pendingEnvRequests: fastify.services.pendingEnvRequests
	};
}

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.put(
		'/:id/env-sets',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				body: SaveEnvSetReqSchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return saveEnvSet(envRelayDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				path: req.body.path,
				vars: req.body.vars
			});
		}
	);

	fastify.delete(
		'/:id/env-sets',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				querystring: DeleteEnvSetQuerySchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return deleteEnvSet(envRelayDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				path: req.query.path
			});
		}
	);
};

export default routes;
