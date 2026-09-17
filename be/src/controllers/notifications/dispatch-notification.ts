import { type NotificationRepo } from 'src/repos/notifications/notification.repo';
import { type PushSubscriptionRepo } from 'src/repos/notifications/push-subscription.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type WebPushService } from 'src/services/notifications/web-push.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type PushSubscription } from 'src/types/PushSubscriptionSchema';
import { type NotificationKind } from 'src/types/NotificationSchema';

export interface DispatchNotificationDeps {
	notificationRepo: NotificationRepo;
	pushSubscriptionRepo: PushSubscriptionRepo;
	socketRegistry: SocketRegistry;
	webPush: WebPushService;
	idService: IdService;
}

// The single fan-in point for every trigger in the plan: a persisted log row is
// the system of record (the board badge and the bell read it back), and a push
// is best-effort delivery on top of it. Called after the triggering write has
// committed — sending a push is external I/O, which never belongs inside that
// write's transaction.
export async function dispatchNotification(
	deps: DispatchNotificationDeps,
	opts: {
		recipientIds: string[];
		projectId: string;
		kind: NotificationKind;
		title: string;
		body: string;
		url: string;
		planId?: string | null;
		quickFixId?: string | null;
	}
): Promise<void> {
	const recipientIds = [...new Set(opts.recipientIds)];

	if (recipientIds.length === 0) {
		return;
	}

	const planId = opts.planId ?? null;
	const quickFixId = opts.quickFixId ?? null;

	const [created, subscriptions] = await Promise.all([
		Promise.all(
			recipientIds.map(async (userId) => ({
				userId,
				notification: await deps.notificationRepo.create({
					id: deps.idService.createNotificationId(),
					userId,
					projectId: opts.projectId,
					kind: opts.kind,
					title: opts.title,
					body: opts.body,
					url: opts.url,
					planId,
					quickFixId
				})
			}))
		),
		deps.pushSubscriptionRepo.listByUserIds(recipientIds)
	]);

	for (const { userId, notification } of created) {
		deps.socketRegistry.sendToUiUser({
			projectId: opts.projectId,
			userId,
			message: { type: 'notification.created', notification }
		});
	}

	const byUser = new Map<string, PushSubscription[]>();

	for (const subscription of subscriptions) {
		const forUser = byUser.get(subscription.userId) ?? [];

		forUser.push(subscription);
		byUser.set(subscription.userId, forUser);
	}

	await Promise.all(
		created.flatMap(({ userId, notification }) =>
			(byUser.get(userId) ?? []).map(async (subscription) => {
				const result = await deps.webPush.send({
					subscription,
					payload: JSON.stringify({ title: opts.title, body: opts.body, url: opts.url, notificationId: notification.id })
				});

				if (!result.ok && result.expired) {
					await deps.pushSubscriptionRepo.deleteById(subscription.id);
				}
			})
		)
	);
}
