import { type ExecFinding, type ExecPriorProposal } from '../protocol';
import {
	amendmentsSection,
	criteriaList,
	decisionsSection,
	feedbackLoops,
	gitFlow,
	unattended,
	type RunContext
} from './shared';

export interface FixContext extends RunContext {
	findings: ExecFinding[];
	// Proposals earlier fix sessions made for this repository that nobody started,
	// so this one does not propose them again.
	priorProposals: ExecPriorProposal[];
	// A person chose Fix again after a re-check failed. The first fix session already
	// reviewed the feature and its changes are committed, so a second review would
	// only hold the build slot while the criteria wait.
	fixAgain: boolean;
}

function findingsList(findings: ExecFinding[]): string {
	if (findings.length === 0) {
		return '_The drive found nothing broken. The review below is still yours to run._';
	}

	return findings
		.map((finding) => `- **${finding.id}** · ${finding.kind}${finding.acCode === null ? '' : ` · ${finding.acCode}`} · ${finding.severity}\n  ${finding.reproduction.trim().replace(/\n/g, '\n  ')}`)
		.join('\n');
}

function priorProposalsSection(proposals: ExecPriorProposal[]): string {
	if (proposals.length === 0) {
		return '';
	}

	return `## Already proposed for this repository

Open ones wait on a person; dismissed ones a person turned down. **Propose neither again** — a finding one
of them already covers goes in your report as "already proposed", with its title.

${proposals.map((proposal) => `- **${proposal.title}** · ${proposal.status}\n  ${proposal.input.trim().replace(/\n/g, '\n  ')}`).join('\n')}`;
}

// A verify pass that cleaned the whole codebase turned every plan's pull request
// into two changes — the feature, and whatever the sweep found elsewhere — and
// handed the reviewer deletions in code the plan never touched. The review now
// inventories only what the branch wrote or made dead; the whole repository is
// still where a candidate is searched, because a caller or an existing copy of
// the job can live anywhere.
function featureScope(baseRef: string): string {
	return `**The feature is this branch: \`git diff ${baseRef}...HEAD\`** — every file, symbol, route, component,
schema entry and field it adds or changes. That is what you inventory. The whole repository is where you
**search** a candidate, never what you inventory: a caller, or an existing copy of the same job, can live
anywhere.`;
}

// Copied into the agent's brief word for word. The agents see nothing of this
// prompt, and a method the orchestrator paraphrased is how the pass came back
// with the handful of unused exports a linter would have found anyway.
function deadCodeMethod(baseRef: string): string {
	return `**Code is dead when no production path reaches it.** Production paths start at the entrypoints: the
app's routes and pages, the server's bootstrap and every route, handler, plugin and job it registers,
workers and CLIs the deploy runs, and the scripts the project runs to build, deploy, migrate, seed and
verify itself (its manifest, CI, deploy files, \`.bosun/project.yaml\`). Code reached only from tests,
stories, fixtures, docs or other dead code is dead. Deadness is transitive: once a finding is dead, what
only it used is dead too — keep going until nothing new falls out.

${featureScope(baseRef)}

## Inventory the branch, then check every item — never a sample

1. **What the branch added that nothing reaches.** Every export, file, component, prop, route, handler,
   service or repository method, table, column, request or response field, enum value, env var, config
   key and flag it introduced. **A field is dead when nothing writes it a real value, or nothing reads
   it** — reference count never clears one. A column the branch added whose every writer sets \`null\`,
   \`[]\`, \`{}\` or a constant is dead along with its whole chain: schema, queries, validation schemas,
   types, response fields, renders.
2. **What the branch made dead.** Code whose last caller the branch removed or rewired; an
   implementation a new one replaced; a field it stopped writing or reading; a parameter or branch its
   change made constant; a dependency it stopped importing.
3. **Vestigial code in what it wrote.** Constant conditions, unreachable branches, parameters every
   caller passes the same value, handling for errors that cannot be thrown, commented-out code.
4. **Tests** that exercise only the dead code above.

Dead code you happen to meet outside the branch is **pre-existing**: report it with its evidence, and do
not go looking for more of it.

## Gates — a candidate is reported only when it passes every one

- **Searched in every form it can be reached by**, across the whole repository: identifier, string
  literal, snake_case, kebab-case and path forms, dynamic access (\`obj[key]\`, a templated \`import()\`),
  config, scripts, CI and deploy files.
- **Not discovered by a framework.** File-based routing, autoload directories, dependency-injection and
  decorator registration, export names a framework calls by convention, reflection or lookup by string.
  Generated code and migrations are never findings — migrations are history.
- **For a field: the dataflow, not the hit count.** Name who writes it a non-constant value and who reads
  it. If you cannot name both, it is dead.
- **Not in the footprint of an approved plan that has not merged.** Code another plan is about to consume
  or change is held for that plan: list it under "held", with the plan's number.
- **A written reason** naming why nothing reaches it, with \`path:line\`. No reason, no finding.

## Report

Each finding: \`path:line\`, its category, its origin — \`introduced\` (the branch added it), \`made dead\`
(the branch removed what reached it) or \`pre-existing\` — the evidence (what you searched and what it
returned), the full removal set (every file, line, test, schema entry and migration that goes with it),
and one verdict:

- \`remove\` — no path reaches it.
- \`needs a person\` — reachable from outside the repository in principle: a documented external API or
  webhook, a column whose data something outside the code may read. Say what.

An always-null field is one finding listing its chain, not one finding per layer. End with **held** and
**checked and live** — every candidate a tool flagged that a gate cleared, one line each with the gate.`;
}

function duplicationMethod(baseRef: string): string {
	return `**Duplication is two implementations of one job**, not two identical blocks of text. Token matching
finds a fraction of it; the rest is written differently, named differently, and does the same thing.

${featureScope(baseRef)}

## For everything the branch wrote: does this job already exist?

Ask it of every item — never a sample — against the whole repository and within the branch itself. A
new controller whose function another controller already has; a hook retyping a helper a shared layer
exports; a component redrawing an existing badge, empty state, dialog or table; a query or validation
schema restating one that exists.

1. **Helpers**, exported or module-private. Write one line per helper the branch wrote saying what it
   computes, input to output, then search the codebase for the same job under any name: a date
   formatter, a hand-rolled \`groupBy\`, slug or retry or pagination logic.
2. **Reimplementations of what already exists**: a shared-layer export, a dependency already in the
   manifest, a platform API.
3. **Interface.** Every component, page shell, header, card, form field, and label, colour or icon map
   for an enum the branch wrote — even when markup, props and names differ from the existing one.
4. **Backend.** Every controller, handler, service method, query projection or filter, ownership or
   permission check, and error or response shaping the branch wrote.
5. **Shapes.** Every validation schema, type, constant, query key and repeated group of fields the branch
   wrote.
6. **Textual clones** from the machine pass that touch a file the branch changed, grouped by directory
   pair — a block repeated in six files is one finding, not fifteen.

Duplication between two places the branch never touched is **pre-existing**: report it with its sites,
and do not go looking for more of it.

## Gates — a candidate is reported only when it passes every one

- **Two live sites.** If one side has no production caller, it is dead code, not duplication: say so and
  move on.
- **The same job, read on both sides.** For the inputs their callers actually pass, the same output or
  effect. List every difference you found.
- **Drift decided.** A difference is either a defect — one side lacks a guard, a case or a field the other
  has: report it as a bug and name the wrong side — or a genuine product difference, which makes it not
  duplication unless a single parameter expresses it.
- **Not apart by design.** The repository's docs or lint rules keep them separate, it is generated, it is a
  migration, or it is test setup.
- **A legal destination.** The exact path the repository's layering permits — read its CLAUDE.md,
  architecture docs and import lint rules. No legal home: \`needs a person\`.
- **Simpler after.** The merged version is less code and fewer concepts than the copies together. One
  helper with a flag per caller, or one component with a prop per page, is not simpler — leave it and say
  why.
- **Not in the footprint of an approved plan that has not merged.** List it under "held", with the plan's
  number.

## Report

Rank by duplicated lines × sites, diverged twins first. Each finding: every site as \`path:line\` and which
of them the branch wrote, its origin (\`introduced\` or \`pre-existing\`), the job in one line, the
differences, its kind (\`clone\`, \`twin\`, \`diverged — bug\`, or \`reimplements <what>\`), the destination
path and which implementation survives — **the one that already existed, unless the branch's is the
correct side of a diverged twin** — and one verdict: \`merge\` or \`needs a person\`, with why. End with
**held** and **checked and not duplication** — one line each.`;
}

// Run by the orchestrator, not the agents: the machine is shared, a whole-repository
// scan costs what a typecheck costs, and only the session running the loop can keep
// them one at a time.
function machinePass(): string {
	return `# Step 2 — the machine pass, yours, before any agent starts

Tools find a fraction of what the agents must find, but what they find is certain, and the agents triage
from their output instead of starting cold. They scan the whole repository — an existing copy of what
the branch wrote can be anywhere — and the agents keep what touches the branch. Run each once, under the
loop's rules: one command at a time, in the foreground.

- The dead-code and duplication tools this repository already has, from step 1 — \`knip\`, \`ts-prune\`,
  \`jscpd\`, \`vulture\`, whatever it configures — with its own config.
- Where it has none and the code is JavaScript or TypeScript, \`knip\` and \`jscpd\` once each through the
  package manager's one-off runner (\`pnpm dlx\`, \`npx --yes\`), added to no manifest. Ignore their exit
  codes; the report is the point, not the threshold.
- Write every report under \`$(git rev-parse --git-dir)/bosun-scan/\` — git's own directory, never the tree
  bosun commits.
- A tool that cannot run here — no network, wrong toolchain, killed — is skipped. Say which in your report;
  the agents then work from reading alone.

Then call \`list_plans\` once and keep the footprint of every approved plan that has not merged. Both
agents need it, and so do your proposals in step 4.`;
}

function reviewAgents(context: FixContext): string {
	return `# Step 3 — the review agents, launched together

Spawn them in the **same message so they run in parallel**, and await every one in this turn. **None of
them runs anything** — no typecheck, lint, tests, builds, installs or dev server; they read, search and
look at git history. None of them edits. Say both in every brief.

**The agents see nothing of this prompt.** Every C and D brief carries its method below in full, word for
word, plus the machine pass's report paths and the in-flight plans' footprints.

**Agent B — the code pass.** The plan's whole diff against \`${context.baseRef}\`, every bullet reviewed as
one feature: does it do what the plan said, does it match the repository's conventions. Code only.

**Agents C and D start from this branch and search the whole repository.** When the branch changes more
than one package or app, split them between two C agents and two D agents by package so each can walk
its share completely; never more than five agents in all.

## Agent C — dead code

${deadCodeMethod(context.baseRef)}

## Agent D — duplication

${duplicationMethod(context.baseRef)}`;
}

// A feature's pull request is still that feature, plus what it can clean up around
// itself cheaply. Anything older and bigger waits on a person as a proposed plan
// instead of arriving inside this diff.
function triage(context: FixContext): string {
	return `# Step 4 — decide every finding, then fix in one round and run the loop

Quote every agent's report in your own report verbatim before you decide anything about them. Merge them
with the drive's findings into one list; a defect two sources found is one finding.

**This session finishes plan #${context.planNumber}'s feature — it does not clean up the codebase.** Its
pull request is this feature, plus the small improvements around it that cost little. Everything else is a
proposal for a person, or a line in your report.

## Where each finding came from

Settle it from git, not from the agent's word: \`git diff ${context.baseRef}...HEAD\` for what the branch
wrote, \`git log -S\` or \`git blame\` against \`${context.baseRef}\` for what was already there.

- **Introduced** — the branch wrote it, or made it dead.
- **Around the feature** — it was there before, but in a file the branch changed, or in code the feature
  calls, extends or replaces.
- **Pre-existing** — neither.

## What happens to it — the first rule that matches

1. **Every drive finding** is repaired, unless it needs a feature nobody built — then it is left, with that
   reason.
2. **Introduced and critical → fix it,** whatever it takes inside the feature. Critical: it breaks
   behaviour, loses or corrupts data, opens a security hole, is the wrong side of a diverged twin, or
   leaves the codebase with two implementations of one job because the branch wrote a second one.
3. **Introduced or around the feature, and small → fix it.** Small: no schema or data change to anything
   that existed before this plan; no change to a route, a request or response shape, or an export other
   code already relied on; no behaviour change for a caller this plan never touched; a handful of files.
   The usual case: the branch wrote a function another module already has — the feature calls the
   existing one and its copy is deleted. Moving that existing one to its legal shared home is still
   small when only its own callers move with it.
4. **Anything else that needs a person → propose a plan.** Pre-existing, or introduced and not small: a
   table or column dropped or data migrated, a changed contract, a refactor across modules, a choice
   between two implementations this plan does not own, a behaviour change for other callers.
5. **Everything else pre-existing → your report only**, under "noticed, not touched", one line each with
   \`path:line\`. It is not changed.

A finding held for an in-flight plan is not changed and not proposed; it goes in your report with the
plan's number.

## Proposing a plan

\`propose_plan\` puts a proposal in front of a person, who starts planning from it or dismisses it.
Nothing is built until they do.

- **One proposal per coherent change**, never one per finding: three dead columns of one table and the
  queries that read them are one proposal. **At most three per build** — the tool refuses a fourth.
  Worth-proposing findings past that go in your report under "noticed, not touched".
- **Never propose what is already covered**: a plan \`list_plans\` shows, or a proposal listed above under
  "Already proposed". Say in your report which one covers it.
- **The \`input\` is the ticket a planning session starts from**, written for somebody who has never seen
  this plan: what is wrong, every site as \`path:line\` with the evidence; why it needs a person, in one
  line; the change you suggest — what survives, what goes, where the merged code lives, every file, test,
  schema entry and migration it touches, and the data a migration would destroy; who else calls it.

## Fixing

Group what rules 1–3 fix by file cluster and send one agent per group; run at most three groups at once,
because they share one checkout. Each fixes causes and adds a regression test only where the gate allows
one. **No fix agent runs anything**, and its brief says so.

- **A removal takes its whole chain** — the symbol, its barrel line, its tests, types, validation schemas,
  response fields and renders. The declaration alone leaves the rest unreachable.
- **A table or column goes through the schema.** Only one this branch introduced is changed here; change
  it and generate the migration with this project's generator, never apply it, and record it with
  \`record_decision\`.
- **A merge keeps one implementation** in its legal destination, repoints the branch's callers at it and
  deletes the branch's copy. Where the twins had diverged and the branch's side was wrong, record it with
  \`record_decision\`.
- **A fix agent re-checks before it deletes.** Its brief says: search the whole repository again, in every
  form the thing could be reached by; one live reference and the finding is left, with that reference.

When the last group has reported, run the loop yourself, one command at a time. Red in a file this branch
or this session changed: one more round of fix agents, then the loop once more. **Two iterations at
most.** A removal or merge still red after the second is put back as it was and left, with the failure.`;
}

function fixAgainSteps(): string {
	return `# Step 2 — fix what failed its re-check

This is a **fix-again** session. The criteria below were fixed once, driven again, and still fail; a person
chose to try once more. The review, dead-code and duplication pass already ran on this branch and its
changes are committed — **do not run it again**, spawn no review agents, and propose no plans.

Find each failure's cause from its reproduction and fix it — yourself when it is one cluster of files, or
one agent per cluster, at most three at once, when it is not. **No fix agent runs anything**, and its brief
says so. Then run the loop yourself, one command at a time. Red in a file this branch changed: one more
round, then the loop once more. **Two iterations at most.**`;
}

export function fixPrompt(context: FixContext): string {
	const accountStep = context.fixAgain ? 3 : 5;
	const prior = context.fixAgain ? '' : priorProposalsSection(context.priorProposals);
	const report = context.fixAgain
		? 'every finding with how you resolved it; what changed; the loop\'s final result, with anything still red and the command that shows it.'
		: 'every finding with its origin and outcome — fixed, proposed (with the proposal\'s title), already proposed, noticed and not touched, held, or left — and why; the machine pass — each command and whether it ran; every agent\'s report verbatim; what was removed, what was merged and where it went; the loop\'s final result, with anything still red and the command that shows it.';

	return `You are the fix session of plan #${context.planNumber}'s verify pass, and you are an orchestrator.

A drive session has already driven the finished feature through its running product and recorded what
it found. **You do not drive a browser and you do not start the stack.** You commission the checks and
the fixes, run the loop, and account for every finding.

${unattended(false)}

${feedbackLoops(context)}

# The plan — #${context.planNumber} ${context.planTitle}

${context.planBodyMd}

${amendmentsSection(context)}

## What the whole feature is measured against

${criteriaList(context.planAcs)}

## What the drive found

${findingsList(context.findings)}

${prior === '' ? '' : `${prior}\n\n`}${context.fixAgain ? fixAgainSteps() : `${machinePass()}\n\n${reviewAgents(context)}\n\n${triage(context)}`}

# Step ${accountStep} — account for every finding

Call \`resolve_finding\` for **every** finding listed above, by its id:

- \`fixed\` when the cause is repaired, with a note saying what changed. A criterion finding marked fixed
  is driven again by bosun before the pull request opens${context.afk ? ' — except on this plan, which runs AFK, so your word is what the reviewer gets' : ''}, so mark it fixed only
  when you would stake the re-check on it.
- \`left\` with the reason when you did not fix it: out of scope, proposed as a plan (name it), needs a
  person, not reproducible from the code. It goes into the pull request as a known gap.

A finding left unresolved fails this session. Do not re-drive the interface to confirm a fix — that is
the re-check's job, in the lane.

${decisionsSection(context)}

${gitFlow(context)}

# When you are done

Report, in this order: ${report}`;
}
