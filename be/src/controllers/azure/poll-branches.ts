import { runAzureConnectionCall, type AzureConnectionGuardDeps } from 'src/controllers/azure/shared/connection-guard';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { onPush } from 'src/controllers/line/shared/provider-events';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type AzureBranchSnapshotService } from 'src/services/azure/azure-branch-snapshot.service';
import { type AzureConnection } from 'src/types/AzureSchema';
import { type Repository } from 'src/types/RepositorySchema';

export interface BranchPollDeps extends AzureConnectionGuardDeps, LineDeps {
	azureDevOps: AzureDevOpsService;
	azureBranchSnapshot: AzureBranchSnapshotService;
}

// AC-66, AC-67: every branch's current commit, read in one refs call and diffed
// against what the previous poll saw, run through the exact push handling a
// webhook delivery would trigger — regardless of whether this repository also
// has active webhook subscriptions, so a missed delivery is never the only way
// a push is noticed.
export async function pollAzureBranches(deps: BranchPollDeps, opts: { repository: Repository; connection: AzureConnection; pat: string }): Promise<void> {
	const heads = await runAzureConnectionCall(deps, opts.connection, () =>
		deps.azureDevOps.listBranchHeads({
			organization: opts.connection.organization,
			pat: opts.pat,
			azureProjectId: opts.repository.azureProjectId!,
			azureRepoId: opts.repository.azureRepoId!
		})
	);

	const current = new Map(heads.map((head) => [head.branch, head.sha]));
	const changed = deps.azureBranchSnapshot.diff(opts.repository.id, current);

	for (const { branch } of changed) {
		await onPush(deps, { repository: opts.repository, branch });
	}
}
