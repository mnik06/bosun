import { HttpError } from 'src/api/errors/HttpError';
import { type ProjectRepo } from 'src/repos/projects/project.repo';
import { type Project } from 'src/types/ProjectSchema';

export async function renameProject(opts: {
	projectRepo: ProjectRepo;
	id: string;
	name: string;
}): Promise<Project> {
	const project = await opts.projectRepo.rename({ id: opts.id, name: opts.name });

	if (!project) {
		throw new HttpError(404, 'Project not found');
	}

	return project;
}
