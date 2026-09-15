import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MarkNotificationReadRespSchema } from 'src/api/routes/schemas/notifications/MarkNotificationReadRespSchema';
import { NotificationIdParamsSchema } from 'src/api/routes/schemas/notifications/NotificationIdParamsSchema';
import { NotificationListQuerySchema } from 'src/api/routes/schemas/notifications/NotificationListQuerySchema';
import { NotificationListRespSchema } from 'src/api/routes/schemas/notifications/NotificationListRespSchema';
import { ReadForPlanReqSchema, ReadForPlanRespSchema } from 'src/api/routes/schemas/notifications/ReadForPlanSchemas';
import { UnreadCountsRespSchema } from 'src/api/routes/schemas/notifications/UnreadCountsRespSchema';
import { getUnreadCounts } from 'src/controllers/notifications/get-unread-counts';
import { listNotifications } from 'src/controllers/notifications/list-notifications';
import { markNotificationRead } from 'src/controllers/notifications/mark-notification-read';
import { markPlanNotificationsRead } from 'src/controllers/notifications/mark-plan-notifications-read';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/',
		{
			preValidation: fastify.requireMembership,
			schema: {
				querystring: NotificationListQuerySchema,
				response: { 200: NotificationListRespSchema }
			}
		},
		async (req) => {
			const notifications = await listNotifications(
				{ notificationRepo: fastify.repos.notificationRepo },
				{
					userId: req.user!.id,
					projectId: req.membership!.projectId,
					unreadOnly: req.query.unread === 'true',
					limit: req.query.limit
				}
			);

			return { notifications };
		}
	);

	fastify.get(
		'/unread-counts',
		{
			preValidation: fastify.requireMembership,
			schema: { response: { 200: UnreadCountsRespSchema } }
		},
		async (req) => {
			const counts = await getUnreadCounts(
				{ notificationRepo: fastify.repos.notificationRepo },
				{ userId: req.user!.id, projectId: req.membership!.projectId }
			);

			return { counts };
		}
	);

	fastify.post(
		'/:id/read',
		{
			schema: {
				params: NotificationIdParamsSchema,
				response: { 200: MarkNotificationReadRespSchema }
			}
		},
		async (req) => {
			const notification = await markNotificationRead(
				{ notificationRepo: fastify.repos.notificationRepo },
				{ id: req.params.id, userId: req.user!.id }
			);

			return { notification };
		}
	);

	fastify.post(
		'/read-for-plan',
		{
			preValidation: fastify.requireMembership,
			schema: {
				body: ReadForPlanReqSchema,
				response: { 200: ReadForPlanRespSchema }
			}
		},
		async (req) => {
			const updated = await markPlanNotificationsRead(
				{ notificationRepo: fastify.repos.notificationRepo },
				{ userId: req.user!.id, projectId: req.membership!.projectId, planId: req.body.planId }
			);

			return { updated };
		}
	);
};

export default routes;
