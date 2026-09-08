import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	CreateQueueReqSchema,
	ListQueuesQuerySchema,
	QueueIdParamsSchema,
	UpdateQueueReqSchema
} from 'src/api/routes/schemas/queues/QueueReqSchemas';
import { createQueue } from 'src/controllers/queues/create-queue';
import { deleteQueue } from 'src/controllers/queues/delete-queue';
import { getQueueDetail } from 'src/controllers/queues/get-queue-detail';
import { listQueues } from 'src/controllers/queues/list-queues';
import { updateQueue } from 'src/controllers/queues/update-queue';
import { QueueDetailSchema, QueueListSchema, QueueSchema } from 'src/types/QueueSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/',
		{ schema: { body: CreateQueueReqSchema, response: { 201: QueueSchema } } },
		async (req, reply) => {
			const queue = await createQueue({
				queueRepo: fastify.repos.queueRepo,
				machineRepo: fastify.repos.machineRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				userId: req.user!.id,
				machineId: req.body.machineId,
				name: req.body.name,
				afk: req.body.afk
			});

			return reply.status(201).send(queue);
		}
	);

	fastify.get(
		'/',
		{ schema: { querystring: ListQueuesQuerySchema, response: { 200: QueueListSchema } } },
		async (req) => {
			return listQueues({
				queueRepo: fastify.repos.queueRepo,
				userId: req.user!.id,
				machineId: req.query.machineId
			});
		}
	);

	fastify.get(
		'/:id',
		{ schema: { params: QueueIdParamsSchema, response: { 200: QueueDetailSchema } } },
		async (req) => {
			return getQueueDetail({
				queueRepo: fastify.repos.queueRepo,
				queueItemRepo: fastify.repos.queueItemRepo,
				sliceRunRepo: fastify.repos.sliceRunRepo,
				queueMessageRepo: fastify.repos.queueMessageRepo,
				planRepo: fastify.repos.planRepo,
				sliceRepo: fastify.repos.sliceRepo,
				id: req.params.id,
				userId: req.user!.id
			});
		}
	);

	fastify.patch(
		'/:id',
		{
			schema: {
				params: QueueIdParamsSchema,
				body: UpdateQueueReqSchema,
				response: { 200: QueueSchema }
			}
		},
		async (req) => {
			return updateQueue({
				queueRepo: fastify.repos.queueRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				userId: req.user!.id,
				afk: req.body.afk
			});
		}
	);

	fastify.delete('/:id', { schema: { params: QueueIdParamsSchema } }, async (req, reply) => {
		await deleteQueue({
			queueRepo: fastify.repos.queueRepo,
			socketRegistry: fastify.services.socketRegistry,
			id: req.params.id,
			userId: req.user!.id
		});

		return reply.status(204).send(undefined);
	});
};

export default routes;
