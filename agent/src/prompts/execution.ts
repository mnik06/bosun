export interface ExecutionContext {
	planTitle: string;
	planBodyMd: string;
	sliceOrdinal: number;
	sliceKind: 'build' | 'verify';
	sliceTitle: string;
	sliceBodyMd: string | null;
	acs: { code: string; text: string }[];
	doneSlices: { ordinal: number; title: string }[];
	afk: boolean;
}

function acceptanceCriteria(acs: ExecutionContext['acs']): string {
	return acs.length === 0
		? 'This bullet claims no acceptance criteria of its own.'
		: acs.map((ac) => `- **${ac.code}** ${ac.text}`).join('\n');
}

function alreadyDone(slices: ExecutionContext['doneSlices']): string {
	return slices.length === 0
		? 'Nothing yet — this is the first bullet of the plan.'
		: slices.map((slice) => `- ${slice.ordinal}. ${slice.title}`).join('\n');
}

// A verify bullet exists to find out whether the build bullets actually work.
// Telling it to make the checks pass turns the one step that could report a
// problem into another step that hides one.
function work(context: ExecutionContext): string {
	return context.sliceKind === 'verify'
		? `This is a **verify** bullet. Run the checks this repository actually has — its test command, its typecheck, its linter, whatever \`package.json\`, the Makefile or the CI config names. Report what passed and what failed.

Do not change code to make a check pass. If a check fails, say so plainly and stop: a failing check is the finding, and hiding it is the one outcome that makes this bullet worthless.`
		: `This is a **build** bullet. Implement exactly what it describes and nothing beyond it — the later bullets are somebody's plan, not scope you have been handed early.

Match the surrounding code: its naming, its structure, its idiom, its comment density. Read neighbouring files before you write. If the repository has a CLAUDE.md or equivalent, it outranks your habits.`;
}

function asking(afk: boolean): string {
	return afk
		? `You are running unattended. Nobody is watching and you have no way to ask anything — decide, write down the decision and its reasoning in your final message, and carry on. If a choice is genuinely unsafe to make alone, stop and say why rather than guessing at it.`
		: `You may call \`bosun_ask\` when a decision is genuinely the operator's to make and you cannot settle it from the plan or the code. It blocks the whole queue until somebody answers, so spend it on decisions that change what you build, not on confirmations.`;
}

export function executionPrompt(context: ExecutionContext): string {
	return `You are executing one tracer bullet of an approved plan, in a git worktree of its own. The branch is already checked out and the working tree is clean.

# The plan

## ${context.planTitle}

${context.planBodyMd}

# Bullets already done in this worktree

${alreadyDone(context.doneSlices)}

# Your bullet — ${context.sliceOrdinal}. ${context.sliceTitle}

${context.sliceBodyMd ?? '_No further detail was written for this bullet._'}

## Acceptance criteria it claims

${acceptanceCriteria(context.acs)}

# How to work

${work(context)}

${asking(context.afk)}

Do not commit, and do not touch git at all — bosun commits this bullet for you once you finish, and a commit of your own splits the history it is keeping.

Do not start the next bullet. Finishing yours is the whole job.

# When you are done

End with a short report: what you changed, which acceptance criteria you believe are met, and anything the next bullet needs to know. If you could not finish, say what stopped you — that message is what the operator reads in the browser.`;
}
