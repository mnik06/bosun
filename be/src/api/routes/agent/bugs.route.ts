import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AgentBugIdParamsSchema,
	AgentBuildIdParamsSchema,
	AgentReportBugsReqSchema,
	AgentUpdateBugStatusReqSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { AgentPlanBugRespSchema, AgentPlanBugsRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { reportBugs, updateBugStatus } from 'src/controllers/line/agent/bugs';
import { lineDeps } from 'src/controllers/line/line-deps';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/builds/:buildId/bugs',
		{ schema: { params: AgentBuildIdParamsSchema, body: AgentReportBugsReqSchema, response: { 200: AgentPlanBugsRespSchema } } },
		async (req) => {
			return reportBugs(lineDeps(fastify), {
				buildId: req.params.buildId,
				machineId: req.agent!.machineId,
				...req.body
			});
		}
	);

	fastify.post(
		'/bugs/:bugId/status',
		{ schema: { params: AgentBugIdParamsSchema, body: AgentUpdateBugStatusReqSchema, response: { 200: AgentPlanBugRespSchema } } },
		async (req) => {
			return updateBugStatus(lineDeps(fastify), {
				bugId: req.params.bugId,
				machineId: req.agent!.machineId,
				sessionId: req.body.sessionId,
				status: req.body.status,
				note: req.body.note ?? null
			});
		}
	);
};

export default routes;
