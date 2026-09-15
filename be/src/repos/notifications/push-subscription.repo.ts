import { and, eq, inArray } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { pushSubscriptions } from 'src/services/drizzle/schema';
import { PushSubscriptionSchema, type PushSubscription } from 'src/types/PushSubscriptionSchema';

const columns = {
	id: pushSubscriptions.id,
	userId: pushSubscriptions.userId,
	endpoint: pushSubscriptions.endpoint,
	p256dh: pushSubscriptions.p256dh,
	auth: pushSubscriptions.auth,
	createdAt: pushSubscriptions.createdAt
};

export function getPushSubscriptionRepo(db: DbOrTx) {
	return {
		// `do update` rather than `do nothing`: the same browser subscribing again
		// (a renewed endpoint, a different signed-in user on a shared machine) is a
		// refresh of who owns it, not a failure.
		async upsert(opts: {
			id: string;
			userId: string;
			endpoint: string;
			p256dh: string;
			auth: string;
		}): Promise<PushSubscription> {
			const [row] = await db
				.insert(pushSubscriptions)
				.values(opts)
				.onConflictDoUpdate({
					target: pushSubscriptions.endpoint,
					set: { userId: opts.userId, p256dh: opts.p256dh, auth: opts.auth }
				})
				.returning(columns);

			return PushSubscriptionSchema.parse(row);
		},

		async deleteByEndpoint(opts: { userId: string; endpoint: string }): Promise<boolean> {
			const rows = await db
				.delete(pushSubscriptions)
				.where(and(eq(pushSubscriptions.userId, opts.userId), eq(pushSubscriptions.endpoint, opts.endpoint)))
				.returning({ id: pushSubscriptions.id });

			return rows.length > 0;
		},

		// A dead endpoint is pruned by the id the send already read, not re-looked-up
		// by owner: the owner is incidental to why the push service rejected it.
		async deleteById(id: string): Promise<void> {
			await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
		},

		async listByUserIds(userIds: string[]): Promise<PushSubscription[]> {
			if (userIds.length === 0) {
				return [];
			}

			const rows = await db.select(columns).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));

			return rows.map((row) => PushSubscriptionSchema.parse(row));
		}
	};
}

export type PushSubscriptionRepo = ReturnType<typeof getPushSubscriptionRepo>;
