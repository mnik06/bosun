import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentBuildIdParamsSchema, AgentProposePlanReqSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { AgentProposePlanRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { proposePlan } from 'src/controllers/line/agent/propose-plan';
import { lineDeps } from 'src/controllers/line/line-deps';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/builds/:buildId/proposals',
		{ schema: { params: AgentBuildIdParamsSchema, body: AgentProposePlanReqSchema, response: { 200: AgentProposePlanRespSchema } } },
		async (req) => {
			const proposal = await proposePlan(lineDeps(fastify), {
				buildId: req.params.buildId,
				machineId: req.agent!.machineId,
				...req.body
			});

			return { proposalId: proposal.id };
		}
	);
};

export default routes;
