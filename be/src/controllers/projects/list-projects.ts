import { type ProjectRepo } from 'src/repos/projects/project.repo';
import { type ProjectWithRole } from 'src/types/ProjectSchema';
import { type User } from 'src/types/UserSchema';

export async function listProjects(opts: {
	projectRepo: ProjectRepo;
	user: User;
}): Promise<ProjectWithRole[]> {
	if (opts.user.isAppOwner) {
		const projects = await opts.projectRepo.listAll();

		return projects.map((project) => ({ ...project, role: 'leader' as const }));
	}

	return opts.projectRepo.listForUser(opts.user.id);
}
