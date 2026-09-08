import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AgentBlockersReqSchema,
	AgentDecisionReqSchema,
	PlanIdParamsSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import {
	AgentBlockersRespSchema,
	AgentDecisionRespSchema,
	AgentMachinePlansRespSchema
} from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { listMachinePlans } from 'src/controllers/plans/agent/list-machine-plans';
import { recordPlanDecision } from 'src/controllers/plans/agent/record-plan-decision';
import { setPlanBlockers } from 'src/controllers/plans/agent/set-plan-blockers';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/plans',
		{ schema: { response: { 200: AgentMachinePlansRespSchema } } },
		async (req) => {
			return listMachinePlans({
				planRepo: fastify.repos.planRepo,
				planBlockerRepo: fastify.repos.planBlockerRepo,
				sliceRepo: fastify.repos.sliceRepo,
				machineId: req.agent!.machineId
			});
		}
	);

	fastify.post(
		'/plans/:id/blockers',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AgentBlockersReqSchema,
				response: { 200: AgentBlockersRespSchema }
			}
		},
		async (req) => {
			return setPlanBlockers({
				planRepo: fastify.repos.planRepo,
				planBlockerRepo: fastify.repos.planBlockerRepo,
				planId: req.params.id,
				machineId: req.agent!.machineId,
				blockedByNumbers: req.body.blockedByNumbers
			});
		}
	);

	fastify.post(
		'/plans/:id/decisions',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AgentDecisionReqSchema,
				response: { 200: AgentDecisionRespSchema }
			}
		},
		async (req) => {
			const decision = await recordPlanDecision({
				planRepo: fastify.repos.planRepo,
				planDecisionRepo: fastify.repos.planDecisionRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				planId: req.params.id,
				machineId: req.agent!.machineId,
				...req.body
			});

			return { decisionId: decision.id };
		}
	);
};

export default routes;
