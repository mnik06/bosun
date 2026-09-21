import { type LineDeps } from 'src/controllers/line/line-deps';
import { type ServerMsg } from 'src/types/protocol';

type PriorProposal = Extract<ServerMsg, { type: 'exec.start' }>['priorProposals'][number];

// Enough of each to recognise it, not the whole brief: a repository with a long
// history of proposals would otherwise hand the fix more of them than of its plan.
const PRIOR_PROPOSALS = 20;
const PRIOR_PROPOSAL_CHARS = 400;

// What a fix session must not propose again: still open, or already turned down by
// a person. A started one is a plan by now, and `list_plans` shows it.
export async function priorProposals(deps: LineDeps, opts: { repositoryId: string }): Promise<PriorProposal[]> {
	const proposals = await deps.planProposalRepo.listUnstartedForRepository({ repositoryId: opts.repositoryId, limit: PRIOR_PROPOSALS });

	return proposals.flatMap((proposal) =>
		proposal.status === 'started' ? [] : [{ title: proposal.title, input: proposal.input.slice(0, PRIOR_PROPOSAL_CHARS), status: proposal.status }]
	);
}
