import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentPlanNumberParamsSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { AgentPlanReadRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { readMachinePlan } from 'src/controllers/plans/agent/list-machine-plans';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/plans/by-number/:number',
		{ schema: { params: AgentPlanNumberParamsSchema, response: { 200: AgentPlanReadRespSchema } } },
		async (req) => {
			return readMachinePlan({
				planRepo: fastify.repos.planRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				buildRepo: fastify.repos.buildRepo,
				machineRepo: fastify.repos.machineRepo,
				machineId: req.agent!.machineId,
				number: req.params.number
			});
		}
	);
};

export default routes;
