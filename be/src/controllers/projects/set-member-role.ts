import { getMemberForLeaderChange } from 'src/controllers/projects/shared/leader-guard';
import { getProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type Db } from 'src/services/drizzle/drizzle.service';
import { type ProjectMembership, type ProjectRole } from 'src/types/ProjectSchema';
import { orNotFound } from 'src/utils/general';

export async function setMemberRole(opts: {
	db: Db;
	projectId: string;
	userId: string;
	role: ProjectRole;
}): Promise<ProjectMembership> {
	return opts.db.transaction(async (tx) => {
		const projectMemberRepo = getProjectMemberRepo(tx);

		await getMemberForLeaderChange({
			projectMemberRepo,
			projectId: opts.projectId,
			userId: opts.userId,
			stillALeader: opts.role === 'leader'
		});

		return orNotFound(
			projectMemberRepo.setRole({
				projectId: opts.projectId,
				userId: opts.userId,
				role: opts.role
			}),
			'Member not found'
		);
	});
}
