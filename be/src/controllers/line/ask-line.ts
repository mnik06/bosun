import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { loadRepositorySnapshot } from 'src/controllers/line/shared/line-snapshot';
import { describeReason } from 'src/controllers/line/shared/reason';
import { verifyLine } from 'src/controllers/line/schedule';
import { getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryMessage } from 'src/types/BuildSchema';
import { type AgentMsg } from 'src/types/protocol';

type AnswerFrame = Extract<AgentMsg, { type: `line.answer.${string}` }>;

// Only the last few. The session reads the repository for anything older, and a
// transcript that grows without bound eventually costs more than the question.
const TRANSCRIPT_KEPT = 12;

async function ownedRepository(deps: LineDeps, opts: { repositoryId: string; projectId: string }) {
	return getOwnedRepository({ repositoryRepo: deps.repositoryRepo, id: opts.repositoryId, projectId: opts.projectId });
}

// What bosun knows and the repository does not say: which plans are where, on which
// branch, and why. Everything else the session finds by looking — through git, from
// the read tree, which is why each branch is named.
async function describeLine(deps: LineDeps, repositoryId: string): Promise<string> {
	const snapshot = await loadRepositorySnapshot(deps, { repositoryId });

	if (!snapshot) {
		return 'This repository no longer exists.';
	}

	const verify = verifyLine(snapshot);
	const lines = snapshot.states.map((state) =>
		[
			`- #${state.plan.number} ${state.plan.title ?? 'Untitled'} — ${state.build.status}: ${describeReason({ state, snapshot, verifyLine: verify }) ?? ''}`,
			state.build.branch === null ? '' : `    branch: ${state.build.branch} (onto ${state.build.baseBranch ?? snapshot.repository.defaultBranch})`,
			state.build.prUrl === null ? '' : `    pull request: ${state.build.prUrl}`,
			...state.runs.map((run) => `    ${run.ordinal}${run.phase === null ? '' : ` ${run.phase}`} — ${run.status}${run.commitSha === null ? '' : ` (${run.commitSha.slice(0, 8)})`}${run.failureReason === null ? '' : ` — ${run.failureReason}`}`)
		]
			.filter(Boolean)
			.join('\n')
	);

	return [
		`Repository ${snapshot.repository.fullName}, default branch ${snapshot.repository.defaultBranch}`,
		'',
		'The line, in order:',
		lines.length === 0 ? '  (nothing in the line)' : lines.join('\n')
	].join('\n');
}

export async function listRepositoryMessages(deps: LineDeps, opts: { repositoryId: string; projectId: string }): Promise<RepositoryMessage[]> {
	const repository = await ownedRepository(deps, opts);

	return deps.repositoryMessageRepo.listForRepository(repository.id);
}

export async function askLine(deps: LineDeps, opts: { repositoryId: string; projectId: string; question: string }): Promise<RepositoryMessage> {
	const repository = await ownedRepository(deps, opts);
	const machine = (await deps.machineRepo.listByRepository(repository.id)).find(
		(entry) => entry.status === 'online' && deps.socketRegistry.getAgentSocket(entry.id) !== null
	);

	if (!machine) {
		throw new HttpError(409, 'no machine attached to this repository is online');
	}

	const askId = deps.idService.createRepositoryMessageId();
	const transcript = await deps.repositoryMessageRepo.listForRepository(repository.id);

	// Delivered before it is recorded: a transcript holding a question no session
	// received reads as asked, and the person waits for an answer nothing will give.
	if (
		!deps.socketRegistry.sendToAgent({
			machineId: machine.id,
			message: {
				type: 'line.ask',
				repositoryId: repository.id,
				askId,
				question: opts.question,
				state: await describeLine(deps, repository.id),
				transcript: transcript.slice(-(TRANSCRIPT_KEPT - 1)).map((entry) => ({ role: entry.role, content: entry.content }))
			}
		})
	) {
		throw new HttpError(409, 'this machine is offline');
	}

	const message = await deps.repositoryMessageRepo.create({ id: askId, repositoryId: repository.id, role: 'user', content: opts.question });

	deps.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'repository.message', message } });

	return message;
}

// The stream is not stored — only the answer it settles on.
export async function recordLineAnswer(deps: LineDeps, opts: { machineId: string; projectId: string; frame: AnswerFrame }): Promise<void> {
	const machine = await deps.machineRepo.getById(opts.machineId);

	if (machine?.repositoryId !== opts.frame.repositoryId) {
		return;
	}

	if (opts.frame.type === 'line.answer.text') {
		deps.socketRegistry.broadcastToUi({
			projectId: opts.projectId,
			message: { type: 'repository.answer', repositoryId: opts.frame.repositoryId, askId: opts.frame.askId, delta: opts.frame.delta }
		});

		return;
	}

	const message = await deps.repositoryMessageRepo.create({
		id: deps.idService.createRepositoryMessageId(),
		repositoryId: opts.frame.repositoryId,
		role: 'assistant',
		content: opts.frame.type === 'line.answer.done' ? opts.frame.content : `I could not answer that: ${opts.frame.message}`
	});

	deps.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'repository.message', message } });
}
