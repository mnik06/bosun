import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AskQueueReqSchema,
	QueueIdParamsSchema,
	QueueItemParamsSchema
} from 'src/api/routes/schemas/queues/QueueReqSchemas';
import { removeQueueItem } from 'src/controllers/queues/remove-queue-item';
import { retryQueueItem } from 'src/controllers/queues/retry-queue-item';
import { retryVerifyRun } from 'src/controllers/queues/retry-verify-run';
import { askDeps } from 'src/controllers/queues/ask-deps';
import { askQueue } from 'src/controllers/queues/ask-queue';
import { schedulerDeps } from 'src/controllers/queues/scheduler-deps';
import { QueueMessageSchema } from 'src/types/QueueSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	// Two paths, one handler: a retry is the same transaction either way — settle
	// what the caller asked for, then let the queue advance — and the difference
	// is entirely in which controller decides what gets re-armed.
	const RETRIES = [
		['/:id/items/:itemId/retry', retryQueueItem],
		['/:id/items/:itemId/verify/retry', retryVerifyRun]
	] as const;

	for (const [path, retry] of RETRIES) {
		fastify.post(path, { schema: { params: QueueItemParamsSchema } }, async (req, reply) => {
			await retry(schedulerDeps(fastify), {
				queueId: req.params.id,
				itemId: req.params.itemId,
				projectId: req.membership!.projectId
			});

			return reply.status(204).send(undefined);
		});
	}

	fastify.delete(
		'/:id/items/:itemId',
		{ schema: { params: QueueItemParamsSchema } },
		async (req, reply) => {
			await removeQueueItem({
				queueRepo: fastify.repos.queueRepo,
				queueItemRepo: fastify.repos.queueItemRepo,
				queueId: req.params.id,
				itemId: req.params.itemId,
				projectId: req.membership!.projectId
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
				projectId: req.membership!.projectId,
				question: req.body.question
			});

			return reply.status(201).send(message);
		}
	);
};

export default routes;
