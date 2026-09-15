import { HttpError } from 'src/api/errors/HttpError';
import { type ProjectRepo } from 'src/repos/projects/project.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

export async function deleteProject(opts: {
	projectRepo: ProjectRepo;
	socketRegistry: SocketRegistry;
	id: string;
}): Promise<void> {
	if (!(await opts.projectRepo.delete(opts.id))) {
		throw new HttpError(404, 'Project not found');
	}

	// After the commit, never inside it: the hang-up is external I/O, and a delete
	// that rolled back must not have disconnected anybody. Without it a member keeps
	// receiving frames on a socket keyed to a project row that no longer exists.
	opts.socketRegistry.closeUiSocketsForProject({ projectId: opts.id });
}
