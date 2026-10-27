import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AgentBuildIdParamsSchema,
	AgentFindingIdParamsSchema,
	AgentFindingReqSchema,
	AgentResolveFindingReqSchema,
	AgentRunParamsSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { AgentFindingRespSchema, AgentRunCriteriaRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { reportFinding, resolveFinding } from 'src/controllers/line/agent/findings';
import { listRunCriteria } from 'src/controllers/line/agent/run-criteria';
import { lineDeps } from 'src/controllers/line/line-deps';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/builds/:buildId/findings',
		{ schema: { params: AgentBuildIdParamsSchema, body: AgentFindingReqSchema, response: { 200: AgentFindingRespSchema } } },
		async (req) => {
			const finding = await reportFinding(lineDeps(fastify), {
				buildId: req.params.buildId,
				machineId: req.agent!.machineId,
				...req.body
			});

			return { findingId: finding.id };
		}
	);

	fastify.get(
		'/builds/:buildId/runs/:runId/criteria',
		{ schema: { params: AgentRunParamsSchema, response: { 200: AgentRunCriteriaRespSchema } } },
		async (req) => listRunCriteria(lineDeps(fastify), { ...req.params, machineId: req.agent!.machineId })
	);

	fastify.post(
		'/findings/:id/resolve',
		{ schema: { params: AgentFindingIdParamsSchema, body: AgentResolveFindingReqSchema, response: { 200: AgentFindingRespSchema } } },
		async (req) => {
			const finding = await resolveFinding(lineDeps(fastify), {
				id: req.params.id,
				machineId: req.agent!.machineId,
				...req.body
			});

			return { findingId: finding.id };
		}
	);
};

export default routes;
