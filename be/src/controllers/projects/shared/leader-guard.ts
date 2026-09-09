import { HttpError } from 'src/api/errors/HttpError';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type ProjectMembership } from 'src/types/ProjectSchema';

// Read inside the caller's transaction, never before it: two leaders standing
// each other down at the same moment would otherwise both see two leaders, both
// pass, and leave a project nobody can manage.
export async function getMemberForLeaderChange(opts: {
	projectMemberRepo: ProjectMemberRepo;
	projectId: string;
	userId: string;
	stillALeader: boolean;
}): Promise<ProjectMembership> {
	const membership = await opts.projectMemberRepo.get({
		projectId: opts.projectId,
		userId: opts.userId
	});

	if (!membership) {
		throw new HttpError(404, 'Member not found');
	}

	if (membership.role !== 'leader' || opts.stillALeader) {
		return membership;
	}

	if ((await opts.projectMemberRepo.countLeaders(opts.projectId)) <= 1) {
		throw new HttpError(409, 'A project must keep at least one leader');
	}

	return membership;
}
