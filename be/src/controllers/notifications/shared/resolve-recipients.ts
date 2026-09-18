import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';

export interface ResolveRecipientsDeps {
	projectMemberRepo: ProjectMemberRepo;
}

export interface RecipientOwner {
	createdByUserId: string | null;
	projectId: string;
}

// Whoever asked for it is who is told about it. `createdByUserId` goes null
// only when the row predates the column or its user was deleted after the
// fact, and every leader is the same fallback every other trigger uses when a
// write carries no user attribution.
export async function resolveRecipients(deps: ResolveRecipientsDeps, owner: RecipientOwner): Promise<string[]> {
	if (owner.createdByUserId) {
		return [owner.createdByUserId];
	}

	return deps.projectMemberRepo.listLeaders(owner.projectId);
}
