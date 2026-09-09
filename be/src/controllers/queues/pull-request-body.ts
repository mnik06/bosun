import { type Ac, type Plan, type PlanDecision } from 'src/types/PlanSchema';

// Criteria carry their verdict rather than being listed flat. A reviewer opening
// this needs to know which of them somebody watched hold, and — the part that
// used to be invisible — which nobody could drive and why.
function criteriaSection(acs: Ac[]): string {
	if (acs.length === 0) {
		return '_None recorded._';
	}

	return acs
		.map((ac) => {
			const line = `- ${ac.verified ? '[x]' : '[ ]'} **${ac.code}** ${ac.text}`;

			return ac.verified || ac.blockedReason === null
				? line
				: `${line}\n  - _Not verified: ${ac.blockedReason}_`;
		})
		.join('\n');
}

function decisionsSection(decisions: PlanDecision[]): string {
	if (decisions.length === 0) {
		return '_None recorded._';
	}

	return decisions
		.map((entry) =>
			[
				`### ${entry.fork}`,
				entry.options === null ? '' : `- **Options:** ${entry.options}`,
				`- **Chose:** ${entry.chose}`,
				entry.blastRadius === null ? '' : `- **Blast radius:** ${entry.blastRadius}`,
				entry.reversing === null ? '' : `- **Reversing it:** ${entry.reversing}`
			]
				.filter(Boolean)
				.join('\n')
		)
		.join('\n\n');
}

// The verify bullet is ordered to report a verdict on every criterion, and its
// report is the only account of what was actually driven. It is carried verbatim
// because the prompt promises the reviewer will read it, and a summary of it
// written here would be a second opinion nobody asked for.
export function pullRequestBody(opts: {
	plan: Plan;
	acs: Ac[];
	decisions: PlanDecision[];
	verifyReport: string | null;
}): string {
	const blocked = opts.acs.filter((ac) => !ac.verified && ac.blockedReason !== null);

	return [
		opts.plan.bodyMd ?? '',
		blocked.length === 0
			? ''
			: `> **${blocked.length} of ${opts.acs.length} acceptance criteria could not be verified.** They are marked below with the reason.`,
		'## Acceptance criteria',
		criteriaSection(opts.acs),
		'## Decisions taken',
		decisionsSection(opts.decisions),
		opts.verifyReport === null ? '' : `## The verify bullet's report\n\n${opts.verifyReport}`,
		`_Planned and executed by bosun as plan #${opts.plan.number}._`
	]
		.filter((section) => section !== '')
		.join('\n\n');
}
