import { getMemberForLeaderChange } from 'src/controllers/projects/shared/leader-guard';
import { getProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type Db } from 'src/services/drizzle/drizzle.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';

export async function removeMember(opts: {
	db: Db;
	socketRegistry: SocketRegistry;
	projectId: string;
	userId: string;
}): Promise<void> {
	await opts.db.transaction(async (tx) => {
		const projectMemberRepo = getProjectMemberRepo(tx);

		await getMemberForLeaderChange({
			projectMemberRepo,
			projectId: opts.projectId,
			userId: opts.userId,
			stillALeader: false
		});

		await projectMemberRepo.remove({ projectId: opts.projectId, userId: opts.userId });
	});

	// After the commit, never inside it: the hang-up is external I/O, and a removal
	// that rolled back must not have disconnected anybody. Without it the ex-member
	// keeps receiving the project's frames on the socket they already hold, because
	// nothing rechecks authorization per frame.
	opts.socketRegistry.closeUiSocketsForMember({
		projectId: opts.projectId,
		userId: opts.userId
	});
}
