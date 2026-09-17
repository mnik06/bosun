import { describe, expect, it, vi } from 'vitest';
import { dispatchNotification } from 'src/controllers/notifications/dispatch-notification';
import { type NotificationRepo } from 'src/repos/notifications/notification.repo';
import { type PushSubscriptionRepo } from 'src/repos/notifications/push-subscription.repo';
import { getSocketRegistry } from 'src/services/sockets/registry.service';
import { type Notification } from 'src/types/NotificationSchema';
import { type PushSubscription } from 'src/types/PushSubscriptionSchema';

function notification(userId: string): Notification {
	return {
		id: `ntf_${userId}`,
		kind: 'onboarding.ready',
		title: 'Onboarding ready',
		body: 'A machine — onboarding is ready',
		url: 'https://app.test/machines/m_1',
		planId: null,
		sentAt: new Date('2026-01-01T00:00:00.000Z'),
		readAt: null
	};
}

function subscription(opts: { id: string; userId: string }): PushSubscription {
	return { id: opts.id, userId: opts.userId, endpoint: `https://push.test/${opts.id}`, p256dh: 'p', auth: 'a', createdAt: new Date() };
}

function build(opts: { subscriptions: PushSubscription[]; sendResult?: { ok: true } | { ok: false; expired: boolean } }) {
	const create = vi.fn(async (row: { userId: string }) => notification(row.userId));
	const deleteById = vi.fn().mockResolvedValue(undefined);
	const send = vi.fn().mockResolvedValue(opts.sendResult ?? { ok: true });
	const socketRegistry = getSocketRegistry();
	const sendToUiUser = vi.spyOn(socketRegistry, 'sendToUiUser');

	return {
		create,
		deleteById,
		send,
		sendToUiUser,
		run: async (recipientIds: string[]) =>
			dispatchNotification(
				{
					notificationRepo: { create } as unknown as NotificationRepo,
					pushSubscriptionRepo: {
						listByUserIds: vi.fn().mockResolvedValue(opts.subscriptions),
						deleteById
					} as unknown as PushSubscriptionRepo,
					socketRegistry,
					webPush: { send },
					idService: { createNotificationId: () => 'ntf_new' } as never
				},
				{
					recipientIds,
					projectId: 'prj_1',
					kind: 'onboarding.ready',
					title: 'Onboarding ready',
					body: 'A machine — onboarding is ready',
					url: 'https://app.test/machines/m_1'
				}
			)
	};
}

describe('dispatchNotification', () => {
	it('does nothing for an empty recipient list', async () => {
		const { create, run } = build({ subscriptions: [] });

		await run([]);

		expect(create).not.toHaveBeenCalled();
	});

	it('deduplicates a recipient named twice', async () => {
		const { create, run } = build({ subscriptions: [] });

		await run(['u_alice', 'u_alice']);

		expect(create).toHaveBeenCalledTimes(1);
	});

	it('logs one notification per recipient and pushes it only to their own sockets', async () => {
		const { create, sendToUiUser, run } = build({ subscriptions: [] });

		await run(['u_alice', 'u_bob']);

		expect(create).toHaveBeenCalledTimes(2);
		expect(sendToUiUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u_alice', projectId: 'prj_1' }));
		expect(sendToUiUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u_bob', projectId: 'prj_1' }));
	});

	it('sends a web push to every subscription the recipient holds', async () => {
		const subscriptions = [
			subscription({ id: 'psub_1', userId: 'u_alice' }),
			subscription({ id: 'psub_2', userId: 'u_alice' }),
			subscription({ id: 'psub_3', userId: 'u_bob' })
		];
		const { send, run } = build({ subscriptions });

		await run(['u_alice']);

		expect(send).toHaveBeenCalledTimes(2);
		expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ subscription: subscriptions[2] }));
	});

	it('prunes a subscription the push service reports as expired', async () => {
		const subscriptions = [subscription({ id: 'psub_dead', userId: 'u_alice' })];
		const { deleteById, run } = build({ subscriptions, sendResult: { ok: false, expired: true } });

		await run(['u_alice']);

		expect(deleteById).toHaveBeenCalledWith('psub_dead');
	});

	it('leaves a subscription alone on a non-expiry failure', async () => {
		const subscriptions = [subscription({ id: 'psub_flaky', userId: 'u_alice' })];
		const { deleteById, run } = build({ subscriptions, sendResult: { ok: false, expired: false } });

		await run(['u_alice']);

		expect(deleteById).not.toHaveBeenCalled();
	});
});
