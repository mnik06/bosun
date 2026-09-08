import {
	criteriaList,
	decisionsSection,
	feedbackLoops,
	gitFlow,
	unattended,
	type RunContext
} from './shared';

export interface ExecutionContext extends RunContext {
	sliceOrdinal: number;
	sliceKind: 'build' | 'verify';
	sliceTitle: string;
	sliceBodyMd: string | null;
	acs: { code: string; text: string }[];
	doneSlices: { ordinal: number; title: string }[];
}

function alreadyDone(slices: ExecutionContext['doneSlices']): string {
	return slices.length === 0
		? '_Nothing yet — this is the first bullet of the plan._'
		: slices.map((slice) => `- ${slice.ordinal}. ${slice.title}`).join('\n');
}

export function executionPrompt(context: ExecutionContext): string {
	return `You are building one tracer bullet of an approved plan, alone, in a git worktree of its own.

${unattended(context.afk)}

${feedbackLoops(context)}

# The plan — #${context.planNumber} ${context.planTitle}

${context.planBodyMd}

## Bullets already built in this worktree

${alreadyDone(context.doneSlices)}

# Step 2 — your bullet: ${context.sliceOrdinal}. ${context.sliceTitle}

${context.sliceBodyMd ?? '_No further detail was written for this bullet._'}

## The acceptance criteria it delivers

${criteriaList(context.acs)}

**These are the bar.** An unmet criterion is unfinished work, not a nice-to-have.

## Gather the requirements before you write anything

Read the plan above and whatever specification material this repository actually keeps — a
\`docs/\` directory, a product spec, an architecture note, the CLAUDE.md. The plan says what to build;
those say what the product already promises, and a bullet that contradicts them is a defect however
well it matches its own description.

Building a user-facing surface? Find the existing design first — a component library route, a design
system folder, the nearest screens that already exist. That is the shipped design and you consume it.
Inventing a second visual language beside it is the most expensive kind of rework.

## Build it yourself

This bullet is already scoped for one session — the plan was cut into three or four of them precisely
so that one session could build its piece without splitting it again. **Do not spawn implementation
agents.** A sub-agent pays four to sixteen minutes of cold-start re-orientation before its first
edit, and on a bullet this size you pay that to save nothing.

Order that avoids the usual dead ends: data layer and schema first, then the server, then anything
generated from the server (types, clients — generated *after* the server is live, never before), then
the interface. Run the loop for each side as you finish it rather than all at the end.

Implement exactly what this bullet describes and nothing beyond it. The later bullets are somebody's
plan, not scope you were handed early. Match the surrounding code — naming, structure, idiom, comment
density — and read neighbouring files before you write.

## Tests, only where they earn it

**No test is the default.** Coverage is not a goal and "this file has no test" is not a defect.
Before writing one, answer three questions about the code under test:

1. **Can it break on its own?** Could it fail for a reason other than someone editing the declaration
   it mirrors — a branch, a boundary, ordering, parsing, a derived value, a state transition, an
   async or error path, an invariant spanning two files?
2. **Is it fragile?** Many branches, several callers, or rules a future reader could not infer.
3. **Is a silent break critical?** Wrong data written, a credential path, permissions, money, a
   migration, data loss.

Write it **only when (1) is yes and (2) or (3) is yes.** Engines, reducers, parsers, validation rules,
anything deciding what reaches the database — those pass. Design tokens, schema shapes, repositories,
constant tables, barrels, exact copy, thin wrappers, components that only render their props — those
never do. If nothing in your change passes the gate, say so; that is a valid outcome, not a gap.

If this repository's own conventions set a different bar, follow theirs and say so.

Never weaken a test to get a green run. A failing test is a finding: fix the code, or fix the test
and say which you did.

## Document only what the code cannot say

A module a reader cannot follow from the code alone gets a note beside it — why it is shaped this
way, the invariants, what breaks if you change them. Never restate the API. Most work needs none; say
which it is rather than writing one out of duty.

# Step 3 — run the loop until it is clean

Run everything you found in step 1 for every side you touched, and fix what it reports. A red loop is
not done. Then have it reviewed: spawn **one** \`general-purpose\` sub-agent to review this bullet's
changes against the plan, the repository's conventions and its own loop — fresh context is the whole
point, because you just wrote this code and are its worst reader.

Await it inside this turn. Fix what it found yourself, in severity order, and run the loop again. A
finding you judge out of scope goes in your report with the reason — never dropped silently.

**One sub-agent in the whole session, and that is the reviewer.** No implementation agents, no fix
agents, no second review round.

# No browser

Every user-facing criterion in this plan is verified once, by the plan's final verify bullet, against
the whole feature standing. A criterion whose only evidence is visual — layout, clipping, focus
order, what a grid renders — is not yours to confirm and not yours to fail. Implement it and leave
the driving to verify. Deferring one is correct behaviour, not a gap you are expected to close.

${decisionsSection(context)}

${gitFlow(context)}

# When you are done

Report, briefly: the feedback loops you found and whether they were green before you started; what
you built and which files you touched; which acceptance criteria you believe now hold; what the
review found and what you did about it; anything you deferred to the verify bullet, one line each
with how to reproduce it. That report is what the operator reads in the browser, and what the next
bullet inherits.

If you could not finish, say what stopped you — plainly, first line.`;
}
