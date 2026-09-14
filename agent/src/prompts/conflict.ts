import { type PlanCriteria } from '../protocol';

function criteriaBlock(plan: PlanCriteria): string {
	const acs = plan.acs.length === 0 ? '_No criteria recorded._' : plan.acs.map((ac) => `- **${ac.code}** ${ac.text}`).join('\n');

	return `### #${plan.planNumber} ${plan.title}\n\n${acs}`;
}

function plansSection(opts: { own: PlanCriteria; others: PlanCriteria[] }): string {
	const others =
		opts.others.length === 0
			? '_Bosun found no other plan in the target\'s history for these files — the other side is somebody\'s direct change to the target branch. Keep what it does._'
			: opts.others.map(criteriaBlock).join('\n\n');

	return `## This branch's plan

${criteriaBlock(opts.own)}

## The plans on the other side

${others}`;
}

const RULES = `# Rules

- **Both intents hold.** A resolution that satisfies one plan's criteria by quietly breaking the
  other's is not a resolution — it is a regression the checks may not catch and the reviewer will not
  see coming. If both cannot hold, call \`give_up\` with why.
- **Only what is needed.** Touch the files that need it, nothing else. No refactors, no renames, no
  improvements you noticed on the way.
- **No git.** Do not commit, stage, abort, reset, checkout, stash or push. Bosun does all of that, and
  it records the diff of every file you resolve into the pull request for the reviewer to read.
- **Never start infrastructure** — no database, container or dev server. No test that needs a database.
- Nobody is watching and nothing can be asked. \`give_up\` is the only way to say you cannot.`;

// The session a real conflict is handed to, mid-merge in the build's worktree. It
// is given the criteria of every plan involved, because a conflict resolved with
// only one plan's intent in view is how the second plan's feature silently goes.
export function conflictPrompt(opts: {
	onto: string;
	files: string[];
	own: PlanCriteria;
	others: PlanCriteria[];
}): string {
	return `You are resolving a merge conflict for bosun. This worktree holds plan #${opts.own.planNumber}'s branch, mid-way
through merging \`${opts.onto}\` into it, and git could not reconcile these files:

${opts.files.map((file) => `- \`${file}\``).join('\n')}

Each still holds conflict markers. Edit every one of them into the version that keeps **what both sides
were for**, and remove every marker. Read the history of each side first — \`git log\`, \`git show\`,
\`git diff\` are available for reading — so you know what each change was trying to do rather than
guessing from the hunk alone.

${plansSection(opts)}

${RULES}

When every file is resolved, say in one line per file what you kept from each side, and stop.`;
}

// The same session, one repair: the merge is committed and the project's checks
// are red. Given one attempt, because a loop nobody chose is how an integration
// runs all afternoon.
export function repairPrompt(opts: {
	onto: string;
	check: string;
	output: string;
	own: PlanCriteria;
	others: PlanCriteria[];
}): string {
	return `You are repairing an integration for bosun. This worktree holds plan #${opts.own.planNumber}'s branch, just merged
with \`${opts.onto}\`, and one of the project's checks now fails:

\`${opts.check}\`

\`\`\`
${opts.output}
\`\`\`

Find why the merged code fails and fix the cause in the source — never by weakening, skipping or
deleting a test or a rule. Most often the two sides each changed something the other relies on: a
renamed symbol, a changed signature, a moved module. Run that check yourself, one command at a time,
until it is green or you are sure it cannot be made green without deciding something only a person can.

${plansSection(opts)}

${RULES}

When the check is green, say in a few lines what was broken and what you changed, and stop.`;
}
