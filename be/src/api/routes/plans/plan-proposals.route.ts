import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreatePlanReqSchema, ProposalIdParamsSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { PlanProposalListRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { lineDeps } from 'src/controllers/line/line-deps';
import { dismissPlanProposal } from 'src/controllers/plans/dismiss-plan-proposal';
import { listPlanProposals } from 'src/controllers/plans/list-plan-proposals';
import { startProposedPlan } from 'src/controllers/plans/start-proposed-plan';
import { PlanProposalSchema } from 'src/types/PlanProposalSchema';
import { PlanSchema } from 'src/types/PlanSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get('/proposals', { schema: { response: { 200: PlanProposalListRespSchema } } }, async (req) => {
		return listPlanProposals(lineDeps(fastify), { projectId: req.membership!.projectId });
	});

	fastify.post(
		'/proposals/:id/start',
		{ schema: { params: ProposalIdParamsSchema, body: CreatePlanReqSchema, response: { 201: PlanSchema } } },
		async (req, reply) => {
			const plan = await startProposedPlan(lineDeps(fastify), {
				proposalId: req.params.id,
				projectId: req.membership!.projectId,
				userId: req.user!.id,
				...req.body
			});

			return reply.status(201).send(plan);
		}
	);

	fastify.post(
		'/proposals/:id/dismiss',
		{ schema: { params: ProposalIdParamsSchema, response: { 200: PlanProposalSchema } } },
		async (req) => {
			return dismissPlanProposal(lineDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				userId: req.user!.id
			});
		}
	);
};

export default routes;
