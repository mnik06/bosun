import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PlanIdParamsSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { AgentPlanRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { savePlanSummary } from 'src/controllers/plans/agent/save-plan-summary';
import { PlanSummarySchema } from 'src/types/PlanSummarySchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/plans/:id/summary',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: PlanSummarySchema,
				response: { 200: AgentPlanRespSchema }
			}
		},
		async (req) => {
			const plan = await savePlanSummary({
				planRepo: fastify.repos.planRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				machineId: req.agent!.machineId,
				summary: req.body
			});

			return { planId: plan.id };
		}
	);
};

export default routes;
