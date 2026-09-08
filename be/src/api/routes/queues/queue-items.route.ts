import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AskQueueReqSchema,
	QueueIdParamsSchema,
	QueueItemParamsSchema
} from 'src/api/routes/schemas/queues/QueueReqSchemas';
import { removeQueueItem } from 'src/controllers/queues/remove-queue-item';
import { retryQueueItem } from 'src/controllers/queues/retry-queue-item';
import { askDeps } from 'src/controllers/queues/ask-deps';
import { askQueue } from 'src/controllers/queues/ask-queue';
import { schedulerDeps } from 'src/controllers/queues/scheduler-deps';
import { QueueMessageSchema } from 'src/types/QueueSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/items/:itemId/retry',
		{ schema: { params: QueueItemParamsSchema } },
		async (req, reply) => {
			await retryQueueItem(schedulerDeps(fastify), {
				queueId: req.params.id,
				itemId: req.params.itemId,
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
	fastify.post(
		'/:id/messages',
		{
			schema: {
				params: QueueIdParamsSchema,
				body: AskQueueReqSchema,
				response: { 201: QueueMessageSchema }
			}
		},
		async (req, reply) => {
			const message = await askQueue(askDeps(fastify), {
				queueId: req.params.id,
				userId: req.user!.id,
				question: req.body.question
			});

			return reply.status(201).send(message);
		}
	);
};

export default routes;
