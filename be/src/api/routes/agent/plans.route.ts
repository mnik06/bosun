import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AgentAcMarkParamsSchema,
	AgentAcMarkReqSchema,
	AgentPlanNameReqSchema,
	AgentPublishReqSchema,
	PlanIdParamsSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import {
	AgentAcRespSchema,
	AgentPlanRespSchema
} from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { markPlanAc } from 'src/controllers/plans/agent/mark-plan-ac';
import { publishPlan } from 'src/controllers/plans/agent/publish-plan';
import { savePlanName } from 'src/controllers/plans/agent/save-plan-name';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/plans/:id/name',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AgentPlanNameReqSchema,
				response: { 200: AgentPlanRespSchema }
			}
		},
		async (req) => {
			const plan = await savePlanName({
				planRepo: fastify.repos.planRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				machineId: req.agent!.machineId,
				title: req.body.title
			});

			return { planId: plan.id };
		}
	);

	fastify.post(
		'/plans/:id/publish',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AgentPublishReqSchema,
				response: { 200: AgentPlanRespSchema }
			}
		},
		async (req) => {
			const plan = await publishPlan({
				db: fastify.db,
				planRepo: fastify.repos.planRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				machineId: req.agent!.machineId,
				...req.body
			});

			return { planId: plan.id };
		}
	);

	fastify.post(
		'/plans/:id/acs/:code/mark',
		{
			schema: {
				params: AgentAcMarkParamsSchema,
				body: AgentAcMarkReqSchema,
				response: { 200: AgentAcRespSchema }
			}
		},
		async (req) => {
			const ac = await markPlanAc({
				planRepo: fastify.repos.planRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				machineId: req.agent!.machineId,
				code: req.params.code,
				...req.body
			});

			return {
				code: ac.code,
				implemented: ac.implemented,
				verified: ac.verified,
				blockedReason: ac.blockedReason
			};
		}
	);
};

export default routes;
