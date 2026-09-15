import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreatePushSubscriptionReqSchema } from 'src/api/routes/schemas/push/CreatePushSubscriptionReqSchema';
import { CreatePushSubscriptionRespSchema } from 'src/api/routes/schemas/push/CreatePushSubscriptionRespSchema';
import { DeletePushSubscriptionReqSchema } from 'src/api/routes/schemas/push/DeletePushSubscriptionReqSchema';
import { subscribeToPush } from 'src/controllers/push/subscribe-to-push';
import { unsubscribeFromPush } from 'src/controllers/push/unsubscribe-from-push';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/subscriptions',
		{
			schema: {
				body: CreatePushSubscriptionReqSchema,
				response: { 200: CreatePushSubscriptionRespSchema }
			}
		},
		async (req) => {
			const subscription = await subscribeToPush(
				{ pushSubscriptionRepo: fastify.repos.pushSubscriptionRepo, idService: fastify.services.idService },
				{ userId: req.user!.id, endpoint: req.body.endpoint, p256dh: req.body.keys.p256dh, auth: req.body.keys.auth }
			);

			return { subscription };
		}
	);

	fastify.delete(
		'/subscriptions',
		{ schema: { body: DeletePushSubscriptionReqSchema } },
		async (req, reply) => {
			await unsubscribeFromPush(
				{ pushSubscriptionRepo: fastify.repos.pushSubscriptionRepo },
				{ userId: req.user!.id, endpoint: req.body.endpoint }
			);

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
