import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MovePlanReqSchema, PlanIdParamsSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { lineDeps } from 'src/controllers/line/line-deps';
import { movePlan } from 'src/controllers/line/move-plan';
import { PlanSchema } from 'src/types/PlanSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.put(
		'/:id/machine',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: MovePlanReqSchema,
				response: { 200: PlanSchema }
			}
		},
		async (req) => {
			return movePlan(lineDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				machineId: req.body.machineId
			});
		}
	);
};

export default routes;
