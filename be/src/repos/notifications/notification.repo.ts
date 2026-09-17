import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { notifications } from 'src/services/drizzle/schema';
import { NotificationSchema, type Notification, type NotificationKind } from 'src/types/NotificationSchema';

const columns = {
	id: notifications.id,
	kind: notifications.kind,
	title: notifications.title,
	body: notifications.body,
	url: notifications.url,
	planId: notifications.planId,
	quickFixId: notifications.quickFixId,
	sentAt: notifications.sentAt,
	readAt: notifications.readAt
};

export function getNotificationRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			userId: string;
			projectId: string;
			kind: NotificationKind;
			title: string;
			body: string;
			url: string;
			planId: string | null;
			quickFixId: string | null;
		}): Promise<Notification> {
			const [row] = await db.insert(notifications).values(opts).returning(columns);

			return NotificationSchema.parse(row);
		},

		async list(opts: { userId: string; projectId: string; unreadOnly: boolean; limit: number }): Promise<Notification[]> {
			const conditions = [eq(notifications.userId, opts.userId), eq(notifications.projectId, opts.projectId)];

			if (opts.unreadOnly) {
				conditions.push(isNull(notifications.readAt));
			}

			const rows = await db
				.select(columns)
				.from(notifications)
				.where(and(...conditions))
				.orderBy(desc(notifications.sentAt))
				.limit(opts.limit);

			return rows.map((row) => NotificationSchema.parse(row));
		},

		// Plan-scoped only: the board badge has nowhere to put an onboarding or
		// machine-offline notification, so those never enter this count.
		async unreadCountsByPlan(opts: { userId: string; projectId: string }): Promise<Array<{ planId: string; count: number }>> {
			const rows = await db
				.select({ planId: notifications.planId, count: count() })
				.from(notifications)
				.where(
					and(
						eq(notifications.userId, opts.userId),
						eq(notifications.projectId, opts.projectId),
						isNull(notifications.readAt),
						isNotNull(notifications.planId)
					)
				)
				.groupBy(notifications.planId);

			return rows.map((row) => ({ planId: row.planId as string, count: row.count }));
		},

		async markRead(opts: { id: string; userId: string }): Promise<Notification | null> {
			const [row] = await db
				.update(notifications)
				.set({ readAt: new Date() })
				.where(and(eq(notifications.id, opts.id), eq(notifications.userId, opts.userId)))
				.returning(columns);

			return row ? NotificationSchema.parse(row) : null;
		},

		async markReadForPlan(opts: { userId: string; projectId: string; planId: string }): Promise<number> {
			const rows = await db
				.update(notifications)
				.set({ readAt: new Date() })
				.where(
					and(
						eq(notifications.userId, opts.userId),
						eq(notifications.projectId, opts.projectId),
						eq(notifications.planId, opts.planId),
						isNull(notifications.readAt)
					)
				)
				.returning({ id: notifications.id });

			return rows.length;
		}
	};
}

export type NotificationRepo = ReturnType<typeof getNotificationRepo>;
