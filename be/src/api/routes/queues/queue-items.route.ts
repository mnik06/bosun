import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { QueueItemParamsSchema } from 'src/api/routes/schemas/queues/QueueReqSchemas';
import { removeQueueItem } from 'src/controllers/queues/remove-queue-item';
import { retryQueueItem } from 'src/controllers/queues/retry-queue-item';
import { schedulerDeps } from 'src/controllers/queues/scheduler-deps';

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
};

export default routes;
