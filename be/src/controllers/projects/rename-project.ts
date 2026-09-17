import { type ProjectRepo } from 'src/repos/projects/project.repo';
import { type Project } from 'src/types/ProjectSchema';
import { orNotFound } from 'src/utils/general';

export async function renameProject(opts: {
	projectRepo: ProjectRepo;
	id: string;
	name: string;
}): Promise<Project> {
	return orNotFound(opts.projectRepo.rename({ id: opts.id, name: opts.name }), 'Project not found');
}
