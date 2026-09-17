import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';

// Line order is a property of the line, so the board is the one place it changes.
// Only what waits can be reordered, and the positions it already holds are dealt
// back out in the new order — nothing building or verifying moves.
export async function reorderLine(
	deps: LineDeps,
	opts: { projectId: string; repositoryId: string; buildIds: string[] }
): Promise<void> {
	const repository = await getOwnedRepository({ repositoryRepo: deps.repositoryRepo, id: opts.repositoryId, projectId: opts.projectId });

	const waiting = await deps.buildRepo.listForRepository({ repositoryId: repository.id, statuses: ['scheduled', 'held'] });
	const known = new Set(waiting.map((build) => build.id));
	const order = [...new Set(opts.buildIds)];

	if (order.some((id) => !known.has(id))) {
		throw new HttpError(400, 'Only plans waiting in this repository\'s line can be reordered');
	}

	const positions = waiting.filter((build) => order.includes(build.id)).map((build) => build.position).sort((a, b) => a - b);

	await deps.buildRepo.setPositions({
		repositoryId: repository.id,
		order: order.map((id, index) => ({ id, position: positions[index]! }))
	});
	deps.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'line.changed', repositoryId: repository.id } });
	await scheduleRepository(deps, { repositoryId: repository.id });
}
