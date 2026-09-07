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
		? `This is a **verify** bullet, and it builds nothing. Every bullet before it has already been executed in this worktree; your job is to drive the finished feature the way a person would and report what you find.

Run the repository's own checks first — its test command, its typecheck, its linter, whatever \`package.json\`, the Makefile or the CI config names. Then walk the journeys this bullet names, through the interface rather than around it.

**The only change you may make is repairing a defect you found doing that.** Not "while I was in there"; not a piece of the feature an earlier bullet left unfinished. If something was never built, that is a finding to report, not work to quietly absorb — the plan was cut wrong and somebody needs to know, and burying it here is how that stays hidden until it is expensive. The same goes for a repair that turns out to be large: report it rather than becoming the bullet that rewrote half the feature.

A failing check is a result, not an obstacle. Never change code to make one pass.`
		: `This is a **build** bullet. Implement exactly what it describes and nothing beyond it — the later bullets are somebody's plan, not scope you have been handed early.

It has to leave the repository working on its own: the verify bullet at the end is a review, not the place your work gets finished. Run whatever checks the repository has before you call it done.

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

The plan you are executing is not the only one written for this repository. If your bullet runs into
something you suspect another plan owns, call \`list_plans\` and look: it returns every plan for this
machine with its number, title, bullets and blockers. Work that belongs to another plan is left to
it — building it here duplicates it, and building it *differently* here is worse. Say in your report
which plan you left it to.

# When you are done

End with a short report: what you changed, which acceptance criteria you believe are met, and anything the next bullet needs to know. If you could not finish, say what stopped you — that message is what the operator reads in the browser.`;
}
