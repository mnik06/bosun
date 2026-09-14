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
}

function findingsList(findings: ExecFinding[]): string {
	if (findings.length === 0) {
		return '_The drive found nothing broken. The code pass below is still yours to run._';
	}

	return findings
		.map((finding) => `- **${finding.id}** · ${finding.kind}${finding.acCode === null ? '' : ` · ${finding.acCode}`} · ${finding.severity}\n  ${finding.reproduction.trim().replace(/\n/g, '\n  ')}`)
		.join('\n');
}

// Today's verify steps without the browser: the review, dead-code and duplication
// passes never needed a stack, so they run in a build slot while the lane drives
// the next plan. What the drive saw arrives as rows, and every one of them has to
// leave this session resolved one way or the other.
export function fixPrompt(context: FixContext): string {
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

# Step 2 — three agents, launched together

Spawn all three in the **same message so they run in parallel**, and await all three in this turn.
**None of them runs anything** — no typecheck, lint, tests, builds or dev server. Say so in every brief.

**Agent B — the code pass.** The plan's whole diff against \`${context.baseRef}\`, every bullet reviewed as
one feature: does it do what the plan said, does it match the repository's conventions. Code only.

**Agent C — dead code.** What *this branch* orphaned: an export nothing calls any more, a component
the rework replaced, a field it stopped writing, a route with no caller.

**Agent D — duplication.** A second implementation of something this branch could have consumed — a
copied hook, a retyped helper, a duplicated builder.

**Scope C and D to this branch explicitly.** Give each the file list from
\`git diff --name-only ${context.baseRef}...HEAD\` and the rule: report only what this branch caused.

# Step 3 — merge, fix in one round, then run the loop

Quote the three reports in your own report verbatim before you decide anything about them. Merge them
with the drive's findings, severity-ordered; a defect two sources found is one finding. Dead code and
duplication rank below anything that breaks behaviour.

Group by file cluster and send one agent per group; run at most three groups at once, because they share
one checkout. Each fixes causes and adds a regression test only where the gate allows one. **No fix
agent runs anything**, and its brief says so. Work that was never built is not yours to absorb here — a
finding that needs a feature nobody built is left, with that reason.

When the last group has reported, run the loop yourself, one command at a time. Red in a file this
branch changed: one more round of fix agents, then the loop once more. **Two iterations at most.**

# Step 4 — account for every finding

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

Report, in this order: every finding with how you resolved it; the three agents' reports verbatim; what
was fixed and what was left; the loop's final result, with anything still red and the command that
shows it.`;
}
