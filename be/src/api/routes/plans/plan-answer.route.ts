import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AnswerPlanReqSchema,
	PlanIdParamsSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { AnswerPlanRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { answerPlanQuestion } from 'src/controllers/plans/answer-plan-question';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/answer',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AnswerPlanReqSchema,
				response: { 202: AnswerPlanRespSchema }
			}
		},
		async (req, reply) => {
			await answerPlanQuestion({
				planRepo: fastify.repos.planRepo,
				planMessageRepo: fastify.repos.planMessageRepo,
				id: req.params.id,
				userId: req.user!.id,
				questionId: req.body.questionId,
				answers: req.body.answers
			});

			return reply.status(202).send({ status: 'accepted' as const });
		}
	);
};

export default routes;
