import { type ProjectRepo } from 'src/repos/projects/project.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type Project } from 'src/types/ProjectSchema';

// No membership row for the creator: only an app owner reaches this, and they
// resolve as a leader of every project without one. Writing it anyway would make
// `project_members` say something the gate does not read.
export async function createProject(opts: {
	projectRepo: ProjectRepo;
	idService: IdService;
	name: string;
}): Promise<Project> {
	return opts.projectRepo.create({ id: opts.idService.createProjectId(), name: opts.name });
}
