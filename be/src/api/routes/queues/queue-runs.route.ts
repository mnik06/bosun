import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AnswerRunReqSchema,
	ControlQueueReqSchema,
	EnqueuePlanReqSchema,
	QueueIdParamsSchema,
	QueueItemParamsSchema,
	RunIdParamsSchema
} from 'src/api/routes/schemas/queues/QueueReqSchemas';
import { advanceQueue } from 'src/controllers/queues/advance-queue';
import { answerRunQuestion } from 'src/controllers/queues/answer-run-question';
import { controlQueue } from 'src/controllers/queues/control-queue';
import { enqueuePlan } from 'src/controllers/queues/enqueue-plan';
import { schedulerDeps } from 'src/controllers/queues/scheduler-deps';
import { removeQueueItem } from 'src/controllers/queues/remove-queue-item';
import { QueueItemSchema, QueueSchema } from 'src/types/QueueSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();
	fastify.post(
		'/:id/items',
		{
			schema: {
				params: QueueIdParamsSchema,
				body: EnqueuePlanReqSchema,
				response: { 201: QueueItemSchema }
			}
		},
		async (req, reply) => {
			const item = await enqueuePlan({
				queueRepo: fastify.repos.queueRepo,
				queueItemRepo: fastify.repos.queueItemRepo,
				sliceRunRepo: fastify.repos.sliceRunRepo,
				planRepo: fastify.repos.planRepo,
				sliceRepo: fastify.repos.sliceRepo,
				idService: fastify.services.idService,
				queueId: req.params.id,
				planId: req.body.planId,
				userId: req.user!.id
			});

			// An idle queue picks the plan up immediately; a running one does not need
			// telling, because it advances when its current bullet settles.
			await advanceQueue(schedulerDeps(fastify), { queueId: req.params.id });

			return reply.status(201).send(item);
		}
	);

	fastify.post(
		'/:id/control',
		{
			schema: {
				params: QueueIdParamsSchema,
				body: ControlQueueReqSchema,
				response: { 200: QueueSchema }
			}
		},
		async (req) => {
			return controlQueue(schedulerDeps(fastify), {
				id: req.params.id,
				userId: req.user!.id,
				action: req.body.action
			});
		}
	);

	fastify.post(
		'/runs/:runId/answer',
		{ schema: { params: RunIdParamsSchema, body: AnswerRunReqSchema } },
		async (req, reply) => {
			await answerRunQuestion(schedulerDeps(fastify), {
				runId: req.params.runId,
				questionId: req.body.questionId,
				answers: req.body.answers,
				userId: req.user!.id
			});

			return reply.status(204).send(undefined);
		}
	);

	fastify.delete(
		'/:id/items/:itemId',
		{ schema: { params: QueueItemParamsSchema } },
		async (req, reply) => {
			await removeQueueItem({
				queueRepo: fastify.repos.queueRepo,
				queueItemRepo: fastify.repos.queueItemRepo,
				queueId: req.params.id,
				itemId: req.params.itemId,
				userId: req.user!.id
			});

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
