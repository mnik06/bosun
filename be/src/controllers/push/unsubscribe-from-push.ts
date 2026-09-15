import { type PushSubscriptionRepo } from 'src/repos/notifications/push-subscription.repo';

// Idempotent: a browser that unsubscribes twice, or one whose subscription was
// already pruned as dead, gets the same 204 as the first call.
export async function unsubscribeFromPush(
	deps: { pushSubscriptionRepo: PushSubscriptionRepo },
	opts: { userId: string; endpoint: string }
): Promise<void> {
	await deps.pushSubscriptionRepo.deleteByEndpoint(opts);
}
