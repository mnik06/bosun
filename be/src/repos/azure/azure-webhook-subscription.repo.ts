import { inArray } from 'drizzle-orm';
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

// Creation is bullet 2's — the subscriptions are made when a repository is
// attached and reconciled on the same timer as pull requests. This bullet only
// needs to read what a connection owns, so disconnect can delete each one from
// Azure before the cascade drops the rows locally (AC-16).
export function getAzureWebhookSubscriptionRepo(db: DbOrTx) {
	return {
		async listForRepositoryIds(repositoryIds: string[]): Promise<AzureWebhookSubscription[]> {
			if (repositoryIds.length === 0) {
				return [];
			}

			const rows = await db.select().from(azureWebhookSubscriptions).where(inArray(azureWebhookSubscriptions.repositoryId, repositoryIds));

			return rows.map((row) => AzureWebhookSubscriptionSchema.parse(row));
		}
	};
}

export type AzureWebhookSubscriptionRepo = ReturnType<typeof getAzureWebhookSubscriptionRepo>;
