import { HttpError } from 'src/api/errors/HttpError';
import { dispatchNotification, type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { AzureError } from 'src/services/azure/azure-devops.service';
import { type AzureConnectionGuardService } from 'src/services/azure/azure-connection-guard.service';
import { type AzureConnection } from 'src/types/AzureSchema';

export interface AzureConnectionGuardDeps extends DispatchNotificationDeps {
	azureConnectionRepo: AzureConnectionRepo;
	projectMemberRepo: ProjectMemberRepo;
	azureConnectionGuard: AzureConnectionGuardService;
	appUrl: string;
}

// Every project member hears about a broken connection exactly once: the update
// only succeeds coming from `active`, so a second failure racing the same dead
// token — or a second repository on the same connection failing right behind
// the first — sees `null` back and skips the notification (AC-72).
async function markConnectionBroken(deps: AzureConnectionGuardDeps, opts: { connection: AzureConnection; message: string }): Promise<void> {
	const broken = await deps.azureConnectionRepo.markBroken({ id: opts.connection.id, lastError: opts.message });

	if (!broken) {
		return;
	}

	const members = await deps.projectMemberRepo.list(opts.connection.projectId);

	await dispatchNotification(deps, {
		recipientIds: members.map((member) => member.userId),
		projectId: opts.connection.projectId,
		kind: 'repository.connection_broken',
		title: 'An Azure DevOps connection broke',
		body: `${opts.connection.organization}'s token stopped working — replace it in Settings to resume syncing.`,
		url: `${deps.appUrl}/settings`,
		planId: null
	});
}

// The one place every call against an established Azure connection is made,
// whether from the line's `GitProvider` seam or from the sync job below. Short
// circuits a connection already known broken or still under a Retry-After
// cooldown (AC-71) without making the call at all; otherwise runs it, and on a
// 401 or a non-JSON body flips the connection broken and notifies the project
// (AC-69, AC-70) before letting the original error through to the caller either
// way — the caller's own failure handling is unchanged by any of this.
export async function runAzureConnectionCall<T>(deps: AzureConnectionGuardDeps, connection: AzureConnection, run: () => Promise<T>): Promise<T> {
	if (connection.status === 'broken') {
		throw new HttpError(409, "This Azure DevOps connection's token is broken — replace it in Settings before bosun can reach this repository");
	}

	if (deps.azureConnectionGuard.isRateLimited(connection.id)) {
		throw new HttpError(429, 'This Azure DevOps connection is rate-limited by Azure DevOps — try again shortly');
	}

	try {
		return await deps.azureConnectionGuard.run(connection.id, run);
	} catch (error) {
		if (error instanceof AzureError && (error.kind === 'invalid_token' || error.kind === 'invalid_response')) {
			await markConnectionBroken(deps, { connection, message: error.message });
		}

		throw error;
	}
}
