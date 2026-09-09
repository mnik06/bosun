import { HttpError } from 'src/api/errors/HttpError';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type ProjectRepo } from 'src/repos/projects/project.repo';
import { type Membership } from 'src/types/ProjectSchema';
import { type User } from 'src/types/UserSchema';

// 404 rather than 403 for a project the caller is not in, for the reason plan 003
// settled about machines: a 403 confirms the project exists, which turns id
// guessing into a way to discover other tenants. The role gate downstream answers
// 403 instead, because by then the caller is a member and already knows.
export async function resolveMembership(opts: {
	projectRepo: ProjectRepo;
	projectMemberRepo: ProjectMemberRepo;
	user: User;
	projectId: string;
}): Promise<Membership> {
	if (opts.user.isAppOwner) {
		const project = await opts.projectRepo.getById(opts.projectId);

		if (!project) {
			throw new HttpError(404, 'Project not found');
		}

		return { projectId: project.id, role: 'leader' };
	}

	const membership = await opts.projectMemberRepo.get({
		projectId: opts.projectId,
		userId: opts.user.id
	});

	if (!membership) {
		throw new HttpError(404, 'Project not found');
	}

	return { projectId: membership.projectId, role: membership.role };
}
