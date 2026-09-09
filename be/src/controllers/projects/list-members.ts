import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type ProjectMember } from 'src/types/ProjectSchema';

export async function listMembers(opts: {
	projectMemberRepo: ProjectMemberRepo;
	projectId: string;
}): Promise<ProjectMember[]> {
	return opts.projectMemberRepo.list(opts.projectId);
}
