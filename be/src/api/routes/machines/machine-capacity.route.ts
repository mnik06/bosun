import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UpdateMachineCapacityReqSchema } from 'src/api/routes/schemas/line/LineSchemas';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import { lineDeps } from 'src/controllers/line/line-deps';
import { saveMachineCapacity } from 'src/controllers/machines/save-machine-capacity';
import { MachineSchema } from 'src/types/MachineSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.patch(
		'/:id',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				body: UpdateMachineCapacityReqSchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return saveMachineCapacity(lineDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				...req.body
			});
		}
	);
};

export default routes;
