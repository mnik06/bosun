import { z } from 'zod';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { onPullRequestMerged, onPush } from 'src/controllers/line/shared/provider-events';
import { stripRefsHeadsPrefix } from 'src/types/AzureSchema';
import { type Repository } from 'src/types/RepositorySchema';

const PushPayloadSchema = z.object({
	resource: z.object({ refUpdates: z.array(z.object({ name: z.string() })) })
});

const PullRequestPayloadSchema = z.object({
	resource: z.object({
		status: z.enum(['active', 'completed', 'abandoned', 'notSet']),
		sourceRefName: z.string()
	})
});

async function onGitPush(deps: LineDeps, opts: { repository: Repository; payload: unknown }): Promise<void> {
	const parsed = PushPayloadSchema.safeParse(opts.payload);

	if (!parsed.success) {
		return;
	}

	for (const refUpdate of parsed.data.resource.refUpdates) {
		if (refUpdate.name.startsWith('refs/heads/')) {
			await onPush(deps, { repository: opts.repository, branch: stripRefsHeadsPrefix(refUpdate.name) });
		}
	}
}

async function onGitPullRequestUpdated(deps: LineDeps, opts: { repository: Repository; payload: unknown }): Promise<void> {
	const parsed = PullRequestPayloadSchema.safeParse(opts.payload);

	if (parsed.success && parsed.data.resource.status === 'completed') {
		await onPullRequestMerged(deps, { repository: opts.repository, headBranch: stripRefsHeadsPrefix(parsed.data.resource.sourceRefName) });
	}
}

// The route already resolved the repository (from its own URL) and verified the
// delivery's secret before calling this, so there is nothing left to look up by
// payload — only to dispatch by `eventType` and reuse the exact push/merge
// handling GitHub's webhook uses (AC-59, AC-60, AC-61). bosun only ever
// subscribes to git.push and git.pullrequest.updated (AC-54), so anything else
// reaching here — or a payload shaped unlike either — is ignored rather than
// treated as an error: a 4xx would only fill Azure's own delivery log.
export async function handleAzureWebhook(deps: LineDeps, opts: { repository: Repository; eventType: string; payload: unknown }): Promise<void> {
	if (opts.eventType === 'git.push') {
		await onGitPush(deps, opts);
	} else if (opts.eventType === 'git.pullrequest.updated') {
		await onGitPullRequestUpdated(deps, opts);
	}

	await scheduleRepository(deps, { repositoryId: opts.repository.id });
	await deps.repositoryRepo.markSynced(opts.repository.id);
}
