import { and, eq, inArray } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { azureWebhookSubscriptions } from 'src/services/drizzle/schema';
import { z } from 'zod';

const AzureWebhookSubscriptionSchema = z.object({
	id: z.string(),
	repositoryId: z.string(),
	eventType: z.enum(['git.push', 'git.pullrequest.updated']),
	azureSubscriptionId: z.string(),
	secretHash: z.string(),
	createdAt: z.date()
});

export type AzureWebhookSubscription = z.infer<typeof AzureWebhookSubscriptionSchema>;

export function getAzureWebhookSubscriptionRepo(db: DbOrTx) {
	return {
		async listForRepositoryIds(repositoryIds: string[]): Promise<AzureWebhookSubscription[]> {
			if (repositoryIds.length === 0) {
				return [];
			}

			const rows = await db.select().from(azureWebhookSubscriptions).where(inArray(azureWebhookSubscriptions.repositoryId, repositoryIds));

			return rows.map((row) => AzureWebhookSubscriptionSchema.parse(row));
		},

		// A webhook delivery names its own repository (the URL) and its own event
		// type (the payload) — together they pick the one row whose secret hash the
		// delivery's header is checked against (AC-56, AC-57).
		async getForRepositoryAndEvent(opts: { repositoryId: string; eventType: string }): Promise<AzureWebhookSubscription | null> {
			const [row] = await db
				.select()
				.from(azureWebhookSubscriptions)
				.where(and(eq(azureWebhookSubscriptions.repositoryId, opts.repositoryId), eq(azureWebhookSubscriptions.eventType, opts.eventType as 'git.push' | 'git.pullrequest.updated')));

			return row ? AzureWebhookSubscriptionSchema.parse(row) : null;
		},

		// Created on first attach and re-created whenever reconciliation finds a
		// subscription unhealthy — either way, one row per (repository, event type),
		// so this upsert is what keeps that unique pair intact (AC-53, AC-55, AC-64).
		async upsert(opts: {
			id: string;
			repositoryId: string;
			eventType: 'git.push' | 'git.pullrequest.updated';
			azureSubscriptionId: string;
			secretHash: string;
		}): Promise<AzureWebhookSubscription> {
			const [row] = await db
				.insert(azureWebhookSubscriptions)
				.values(opts)
				.onConflictDoUpdate({
					target: [azureWebhookSubscriptions.repositoryId, azureWebhookSubscriptions.eventType],
					set: { azureSubscriptionId: opts.azureSubscriptionId, secretHash: opts.secretHash }
				})
				.returning();

			return AzureWebhookSubscriptionSchema.parse(row);
		}
	};
}

export type AzureWebhookSubscriptionRepo = ReturnType<typeof getAzureWebhookSubscriptionRepo>;
