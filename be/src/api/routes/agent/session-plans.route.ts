import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentAddSessionPlanReqSchema, PlanIdParamsSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { AgentSessionPlanRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { addSessionPlan } from 'src/controllers/plans/agent/add-session-plan';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/plans/:id/session-plans',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AgentAddSessionPlanReqSchema,
				response: { 200: AgentSessionPlanRespSchema }
			}
		},
		async (req) => {
			const plan = await addSessionPlan({
				planRepo: fastify.repos.planRepo,
				planMessageRepo: fastify.repos.planMessageRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				machineId: req.agent!.machineId,
				title: req.body.title,
				input: req.body.input
			});

			return { planId: plan.id, number: plan.number };
		}
	);
};

export default routes;
