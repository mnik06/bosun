import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AnswerRunReqSchema, RunIdParamsSchema } from 'src/api/routes/schemas/line/LineSchemas';
import { answerRun } from 'src/controllers/line/answer-run';
import { lineDeps } from 'src/controllers/line/line-deps';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/answer',
		{ schema: { params: RunIdParamsSchema, body: AnswerRunReqSchema } },
		async (req, reply) => {
			await answerRun(lineDeps(fastify), {
				runId: req.params.id,
				questionId: req.body.questionId,
				answers: req.body.answers,
				projectId: req.membership!.projectId
			});

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
