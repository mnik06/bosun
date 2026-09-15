import { type PushSubscriptionRepo } from 'src/repos/notifications/push-subscription.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type PushSubscription } from 'src/types/PushSubscriptionSchema';

export async function subscribeToPush(
	deps: { pushSubscriptionRepo: PushSubscriptionRepo; idService: IdService },
	opts: { userId: string; endpoint: string; p256dh: string; auth: string }
): Promise<PushSubscription> {
	return deps.pushSubscriptionRepo.upsert({
		id: deps.idService.createPushSubscriptionId(),
		userId: opts.userId,
		endpoint: opts.endpoint,
		p256dh: opts.p256dh,
		auth: opts.auth
	});
}
