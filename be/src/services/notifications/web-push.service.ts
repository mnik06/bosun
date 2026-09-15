import webpush, { WebPushError } from 'web-push';

export interface WebPushService {
	// Never throws: a dead endpoint is an expected outcome the caller prunes, not
	// a failure to propagate.
	send(opts: {
		subscription: { endpoint: string; p256dh: string; auth: string };
		payload: string;
	}): Promise<{ ok: true } | { ok: false; expired: boolean }>;
}

export function getWebPushService(opts: { publicKey: string; privateKey: string; subject: string }): WebPushService {
	webpush.setVapidDetails(opts.subject, opts.publicKey, opts.privateKey);

	return {
		async send(sendOpts) {
			try {
				await webpush.sendNotification(
					{
						endpoint: sendOpts.subscription.endpoint,
						keys: { p256dh: sendOpts.subscription.p256dh, auth: sendOpts.subscription.auth }
					},
					sendOpts.payload
				);

				return { ok: true };
			} catch (error) {
				// 404/410 is the push service saying the endpoint is gone for good — the
				// browser unregistered it, or it expired. Anything else (a transient 5xx,
				// a bad payload) is not evidence the subscription is dead.
				const expired = error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410);

				return { ok: false, expired };
			}
		}
	};
}
