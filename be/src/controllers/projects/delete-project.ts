import { HttpError } from 'src/api/errors/HttpError';
import { type ProjectRepo } from 'src/repos/projects/project.repo';

export async function deleteProject(opts: {
	projectRepo: ProjectRepo;
	id: string;
}): Promise<void> {
	if (!(await opts.projectRepo.delete(opts.id))) {
		throw new HttpError(404, 'Project not found');
	}
}
