import { type ExecFinding } from '../protocol';
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
	// A person chose Fix again after a re-check failed. The first fix session already
	// swept the codebase and its changes are committed, so a second sweep would only
	// hold the build slot while the criteria wait.
	fixAgain: boolean;
}

function findingsList(findings: ExecFinding[]): string {
	if (findings.length === 0) {
		return '_The drive found nothing broken. The codebase pass below is still yours to run._';
	}

	return findings
		.map((finding) => `- **${finding.id}** · ${finding.kind}${finding.acCode === null ? '' : ` · ${finding.acCode}`} · ${finding.severity}\n  ${finding.reproduction.trim().replace(/\n/g, '\n  ')}`)
		.join('\n');
}

// Copied into the agent's brief word for word. The agents see nothing of this
// prompt, and a method the orchestrator paraphrased is how the pass came back
// with the handful of unused exports a linter would have found anyway.
const DEAD_CODE_METHOD = `**Code is dead when no production path reaches it.** Production paths start at the entrypoints: the
app's routes and pages, the server's bootstrap and every route, handler, plugin and job it registers,
workers and CLIs the deploy runs, and the scripts the project runs to build, deploy, migrate, seed and
verify itself (its manifest, CI, deploy files, \`.bosun/project.yaml\`). Code reached only from tests,
stories, fixtures, docs or other dead code is dead. Deadness is transitive: once a finding is dead, what
only it used is dead too — keep going until nothing new falls out.

## Inventory, then check every item — never a sample

1. **Files and exports.** Every exported function, constant, type, class, hook and component; every file
   no entrypoint reaches; barrel lines re-exporting what nobody imports through the barrel.
2. **Backend surface.** Every controller, handler and service method; every repository or query method;
   every route with no caller in any client — search for the path string, not the symbol.
3. **Interface.** Every component never rendered; props never passed, or always passed the same value;
   variants and branches for states that can never occur; pages no route reaches.
4. **Data.** Every table and column in the schema, every request field, response field, enum value, env
   var, config key and feature flag. **A field is dead when nothing writes it a real value, or nothing
   reads it** — reference count never clears one. A column named in thirty places whose every writer sets
   \`null\`, \`[]\`, \`{}\` or a constant, or that no insert includes, is dead along with its whole chain:
   schema, queries, validation schemas, types, response fields, renders. A request field no client sends,
   a response field no client reads, a flag that never flips — same question, same answer.
5. **Vestigial code.** Constant conditions, unreachable branches, parameters every caller passes the same
   value, handling for errors that cannot be thrown, commented-out code, manifest dependencies nothing
   imports.
6. **Tests** that exercise only dead code die with it.

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

Each finding: \`path:line\`, its category, the evidence (what you searched and what it returned), the full
removal set (every file, line, test, schema entry and migration that goes with it), and one verdict:

- \`remove\` — no path reaches it.
- \`needs a person\` — reachable from outside the repository in principle: a documented external API or
  webhook, a column whose data something outside the code may read. Say what.

An always-null field is one finding listing its chain, not one finding per layer. End with **held** and
**checked and live** — every candidate a tool flagged that a gate cleared, one line each with the gate.`;

const DUPLICATION_METHOD = `**Duplication is two implementations of one job**, not two identical blocks of text. Token matching
finds a fraction of it; the rest is written differently, named differently, and does the same thing.

## Inventory by responsibility — walk everything, never a sample

1. **Helpers**, exported or module-private. Write one line per helper saying what it computes, input to
   output, then group the lines that describe the same job: two date formatters, a hand-rolled
   \`groupBy\`, the same slug or retry or pagination logic retyped per module.
2. **Reimplementations of what already exists**: a shared-layer export, a dependency already in the
   manifest, a platform API. Every copy is redundant, including the one that came first.
3. **Interface.** Components that represent the same thing — two status badges, two empty states, two
   confirm dialogs, two tables of the same entity, a page shell, header, card or form field retyped per
   page — even when markup, props and names differ. Label, colour and icon maps for the same enum kept in
   more than one place.
4. **Backend.** Controllers or handlers performing the same operation for different entities or callers;
   services wrapping the same third-party call twice; queries returning the same projection or filter;
   ownership and permission checks retyped per route; error and response shaping.
5. **Shapes.** Validation schemas restating a type that already exists, types restating each other,
   constants and query keys defined twice, the same group of columns or fields repeated.
6. **Textual clones** from the machine pass, grouped by directory pair — a block repeated in six files is
   one finding, not fifteen.

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

Rank by duplicated lines × sites, diverged twins first. Each finding: every site as \`path:line\`, the job
in one line, the differences, its kind (\`clone\`, \`twin\`, \`diverged — bug\`, or \`reimplements <what>\`), the
destination path and which implementation survives, and one verdict: \`merge\` or \`needs a person\`, with
why. End with **held** and **checked and not duplication** — one line each.`;

// Run by the orchestrator, not the agents: the machine is shared, a whole-repository
// scan costs what a typecheck costs, and only the session running the loop can keep
// them one at a time.
function machinePass(): string {
	return `# Step 2 — the machine pass, yours, before any agent starts

Tools find a fraction of what the agents must find, but what they find is certain, and the agents triage
from their output instead of starting cold. Run each once, under the loop's rules: one command at a time,
in the foreground.

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
agents need it.`;
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

**Agents C and D cover the whole codebase, not this branch** — every package and app, including code this
plan never touched. When the repository holds more than one package or app, split them between two C
agents and two D agents so each can walk its share completely; never more than five agents in all. An
agent owns its share's inventory but searches the whole repository when it checks a candidate, because a
caller can live anywhere.

## Agent C — dead code

${DEAD_CODE_METHOD}

## Agent D — duplication

${DUPLICATION_METHOD}

# Step 4 — merge, fix in one round, then run the loop

Quote every agent's report in your own report verbatim before you decide anything about them. Merge them
with the drive's findings into one list; a defect two sources found is one finding. Order: anything that
breaks behaviour, then diverged twins, then dead code and duplication.

**Fixed in this session:** every drive finding you can repair, and every \`remove\` and \`merge\` finding
wherever it is in the codebase. Cleanup outside this plan's files is this session's work, not a
follow-up — the goal is the smallest codebase that still does everything the product does. A \`needs a
person\` or held finding is not changed; it goes in your report with its reason.

- **A removal takes its whole chain** — the symbol, its barrel line, its tests, types, validation schemas,
  response fields and renders. The declaration alone leaves the rest unreachable.
- **A table or column goes through the schema.** Change it and generate the migration with this project's
  generator; never apply it. Record each with \`record_decision\`, naming the data the migration destroys:
  once merged that is irreversible, and the reviewer reads it before the diff.
- **A merge keeps one implementation** in its legal destination, repoints every caller at it and deletes
  the rest. Where the twins had diverged, the survivor carries the correct side's behaviour; record that
  with \`record_decision\`, because the other side's callers change.
- **A fix agent re-checks before it deletes.** Its brief says: search the whole repository again, in every
  form the thing could be reached by; one live reference and the finding is left, with that reference.

Group by file cluster and send one agent per group; run at most three groups at once, because they share
one checkout. Each fixes causes and adds a regression test only where the gate allows one. **No fix agent
runs anything**, and its brief says so. Work that was never built is not yours to absorb here — a finding
that needs a feature nobody built is left, with that reason.

When the last group has reported, run the loop yourself, one command at a time. Red in a file this branch
or this session changed: one more round of fix agents, then the loop once more. **Two iterations at
most.** A removal or merge still red after the second is put back as it was and left, with the failure.`;
}

function fixAgainSteps(): string {
	return `# Step 2 — fix what failed its re-check

This is a **fix-again** session. The criteria below were fixed once, driven again, and still fail; a person
chose to try once more. The review, dead-code and duplication pass already ran on this branch and its
changes are committed — **do not run it again**, and spawn no review agents.

Find each failure's cause from its reproduction and fix it — yourself when it is one cluster of files, or
one agent per cluster, at most three at once, when it is not. **No fix agent runs anything**, and its brief
says so. Then run the loop yourself, one command at a time. Red in a file this branch changed: one more
round, then the loop once more. **Two iterations at most.**`;
}

export function fixPrompt(context: FixContext): string {
	const accountStep = context.fixAgain ? 3 : 5;
	const report = context.fixAgain
		? 'every finding with how you resolved it; what changed; the loop\'s final result, with anything still red and the command that shows it.'
		: 'every finding with how you resolved it; the machine pass — each command and whether it ran; every agent\'s report verbatim; what was removed, what was merged and where it went, and what was left or held with its reason; the loop\'s final result, with anything still red and the command that shows it.';

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

${context.fixAgain ? fixAgainSteps() : `${machinePass()}\n\n${reviewAgents(context)}`}

# Step ${accountStep} — account for every finding

Call \`resolve_finding\` for **every** finding listed above, by its id:

- \`fixed\` when the cause is repaired, with a note saying what changed. A criterion finding marked fixed
  is driven again by bosun before the pull request opens${context.afk ? ' — except on this plan, which runs AFK, so your word is what the reviewer gets' : ''}, so mark it fixed only
  when you would stake the re-check on it.
- \`left\` with the reason when you did not fix it: out of scope, needs a person, not reproducible from the
  code. It goes into the pull request as a known gap.

A finding left unresolved fails this session. Do not re-drive the interface to confirm a fix — that is
the re-check's job, in the lane.

${decisionsSection(context)}

${gitFlow(context)}

# When you are done

Report, in this order: ${report}`;
}
