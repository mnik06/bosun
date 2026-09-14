import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AgentBlockersReqSchema,
	AgentDecisionReqSchema,
	AgentPlanCriteriaQuerySchema,
	PlanIdParamsSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import {
	AgentBlockersRespSchema,
	AgentDecisionRespSchema,
	AgentMachinePlansRespSchema,
	AgentPlanCriteriaRespSchema
} from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { listPlanCriteria } from 'src/controllers/line/agent/findings';
import { lineDeps } from 'src/controllers/line/line-deps';
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
				planDependencyRepo: fastify.repos.planDependencyRepo,
				sliceRepo: fastify.repos.sliceRepo,
				buildRepo: fastify.repos.buildRepo,
				machineRepo: fastify.repos.machineRepo,
				machineId: req.agent!.machineId
			});
		}
	);

	fastify.get(
		'/plans/criteria',
		{ schema: { querystring: AgentPlanCriteriaQuerySchema, response: { 200: AgentPlanCriteriaRespSchema } } },
		async (req) => {
			return listPlanCriteria(lineDeps(fastify), { machineId: req.agent!.machineId, numbers: req.query.numbers });
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
				planDependencyRepo: fastify.repos.planDependencyRepo,
				idService: fastify.services.idService,
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
