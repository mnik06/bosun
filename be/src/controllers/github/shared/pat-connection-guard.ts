import { HttpError } from 'src/api/errors/HttpError';
import { classifyGithubFailure } from 'src/controllers/github/shared/classify-github-failure';
import { dispatchNotification, type DispatchNotificationDeps } from 'src/controllers/notifications/dispatch-notification';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type GithubPatConnectionGuardService } from 'src/services/github/github-pat-connection-guard.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';

export interface GithubPatConnectionGuardDeps extends DispatchNotificationDeps {
	githubPatConnectionRepo: GithubPatConnectionRepo;
	projectMemberRepo: ProjectMemberRepo;
	githubPatConnectionGuard: GithubPatConnectionGuardService;
	appUrl: string;
}

// AC-43, AC-44, AC-46: an invalid or expired token, a missing SSO
// authorization, and an organization's policy turning against the token all
// mean the whole connection is dead. `missing_scope` (a generic 403 — most
// often a repository this token can no longer push to, or a hook-creation
// permission it never had for that one repository) and `pending_approval`
// stay out on purpose: neither means every other repository this connection
// reaches has also stopped working (AC-70).
const BREAKING_KINDS = new Set<string>(['invalid_token', 'sso_required', 'org_restricted']);

// Every project member hears about a broken connection exactly once: the
// update only succeeds coming from `active`, so a second failure racing the
// same dead token — or a second repository on the same connection failing
// right behind the first — sees `null` back and skips the notification
// (AC-69).
async function markConnectionBroken(deps: GithubPatConnectionGuardDeps, opts: { connection: GithubPatConnection; message: string }): Promise<void> {
	const broken = await deps.githubPatConnectionRepo.markBroken({ id: opts.connection.id, lastError: opts.message });

	if (!broken) {
		return;
	}

	const members = await deps.projectMemberRepo.list(opts.connection.projectId);

	await dispatchNotification(deps, {
		recipientIds: members.map((member) => member.userId),
		projectId: opts.connection.projectId,
		kind: 'repository.connection_broken',
		title: 'A GitHub personal access token broke',
		body: `${opts.connection.githubLogin}'s token stopped working — replace it in Settings to resume syncing.`,
		url: `${deps.appUrl}/settings`,
		planId: null
	});
}

// The one place every call against an established GitHub PAT connection is
// made, whether from the line's `GitProvider` seam or from the sync job below.
// Short-circuits a connection already known broken or still under a
// rate-limit cooldown without making the call at all; otherwise runs it, and
// on a connection-wide failure flips the connection broken and notifies the
// project (AC-43, AC-44, AC-46, AC-69) before letting the original error
// through to the caller either way — the caller's own failure handling is
// unchanged by any of this.
export async function runGithubPatConnectionCall<T>(deps: GithubPatConnectionGuardDeps, connection: GithubPatConnection, run: () => Promise<T>): Promise<T> {
	if (connection.status === 'broken') {
		throw new HttpError(409, 'This personal access token is broken — replace it in Settings before bosun can reach this repository');
	}

	if (deps.githubPatConnectionGuard.isRateLimited(connection.id)) {
		throw new HttpError(429, 'This GitHub connection is rate-limited by GitHub — try again shortly');
	}

	try {
		return await deps.githubPatConnectionGuard.run(connection.id, run);
	} catch (error) {
		const classified = classifyGithubFailure(error);

		if (classified !== null && BREAKING_KINDS.has(classified.kind)) {
			await markConnectionBroken(deps, {
				connection,
				message: classified.ssoUrl === undefined ? classified.message : `${classified.message} (${classified.ssoUrl})`
			});
		}

		throw error;
	}
}
