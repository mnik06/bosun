import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { requireHost } from 'src/controllers/machines/shared/require-host';
import { quickFixAdmission } from 'src/controllers/quick-fixes/quick-fix-admission';
import { toBranchSlug } from 'src/types/BuildSchema';
import { type QuickFix } from 'src/types/QuickFixSchema';

// The id comes first so the branch is unique on its own; the description is there
// only to make it readable in a branch list.
function quickFixBranch(opts: { id: string; description: string }): string {
	const slug = toBranchSlug(opts.description);

	return `bosun/quickfix/${opts.id}${slug === '' ? '' : `-${slug}`}`;
}

// Dispatched straight over the machine's own agent socket, with no Plan, board
// card, AC or tracer bullet behind it: `quick_fixes` is its own system of record,
// entirely outside the line.
export async function dispatchQuickFix(
	deps: LineDeps,
	opts: { projectId: string; createdByUserId: string; machineId: string; description: string }
): Promise<QuickFix> {
	const machine = await requireHost({
		machineRepo: deps.machineRepo,
		socketRegistry: deps.socketRegistry,
		machineId: opts.machineId,
		projectId: opts.projectId
	});

	// A machine can host a plan off a bare checkout with no `Repository` row
	// (`repoPath` alone — see `awaitingRepository`), but a quick fix ends in a pull
	// request, which needs a GitHub-attached repository to open one against.
	if (machine.repositoryId === null) {
		throw new HttpError(409, 'this machine has no repository attached');
	}

	const repository = await deps.repositoryRepo.getById(machine.repositoryId);

	if (!repository) {
		throw new HttpError(404, 'Repository not found');
	}

	const admission = await quickFixAdmission(deps, { machine });

	if (!admission.admitted) {
		throw new HttpError(409, 'this machine is at capacity — let a build or another quick fix finish first');
	}

	const id = deps.idService.createQuickFixId();
	const quickFix = await deps.quickFixRepo.create({
		id,
		projectId: opts.projectId,
		machineId: machine.id,
		repositoryId: repository.id,
		branch: quickFixBranch({ id, description: opts.description }),
		baseBranch: repository.defaultBranch,
		description: opts.description,
		createdByUserId: opts.createdByUserId
	});

	const dispatched = deps.socketRegistry.sendToAgent({
		machineId: machine.id,
		message: {
			type: 'quickfix.start',
			quickFixId: quickFix.id,
			branch: quickFix.branch,
			baseRef: quickFix.baseBranch,
			description: quickFix.description,
			memoryMaxBytes: admission.limitBytes
		}
	});

	if (!dispatched) {
		const failed = await deps.quickFixRepo.settle({
			id: quickFix.id,
			status: 'failed',
			error: 'the machine went offline before the session started'
		});

		return failed ?? quickFix;
	}

	return quickFix;
}
