import { type Ac, type Plan, type PlanDecision } from 'src/types/PlanSchema';

// GitHub refuses a body over 65536 characters, and it refuses it *after* the
// branch is pushed — the work lands and the pull request does not exist. This
// body used to be the whole plan document, every criterion, every decision and
// the verify report verbatim, which a plan with sixty-odd criteria goes past
// without being unusual.
//
// So the pull request carries the verdict and bosun carries the detail. What a
// reviewer needs before opening anything is what shipped, whether the criteria
// held, and what was decided along the way; the plan, the bullets and every
// session's output are one link away and are not worth copying into a body that
// can fail to post.
const MAX_BODY = 60_000;
const MAX_OVERVIEW = 800;
const MAX_REPORT = 4_000;
const MAX_TEXT = 160;
const MAX_LISTED = 10;

function clip(text: string, max: number): string {
	const trimmed = text.trim();

	return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}…`;
}

function listed<T>(entries: T[], render: (entry: T) => string): string {
	const shown = entries.slice(0, MAX_LISTED).map(render);
	const rest = entries.length - shown.length;

	return [...shown, rest === 0 ? '' : `- _…and ${rest} more, on the plan._`]
		.filter(Boolean)
		.join('\n');
}

// The headline a summary session wrote, and the opening of the plan document
// only when there is none: the first paragraph of a plan reads as an abstract,
// and it is the rest of the document that blew the limit.
function overview(plan: Plan): string {
	const headline = plan.summary?.headline ?? (plan.bodyMd ?? '').trim().split(/\n{2,}/)[0] ?? '';

	return clip(headline, MAX_OVERVIEW);
}

// Counts rather than a checklist, because the checklist is on the plan and the
// number is what a reviewer acts on. The exception is a criterion nobody could
// drive: that one is named here with its reason, because it is the part of the
// verdict the branch cannot show and the reviewer has to decide about.
function criteriaSection(acs: Ac[]): string {
	if (acs.length === 0) {
		return '_None recorded._';
	}

	const verified = acs.filter((ac) => ac.verified);
	const blocked = acs.filter((ac) => !ac.verified && ac.blockedReason !== null);
	const silent = acs.length - verified.length - blocked.length;
	const tally = [
		`**${verified.length} of ${acs.length} verified.**`,
		blocked.length === 0 ? '' : `${blocked.length} could not be driven.`,
		silent === 0 ? '' : `${silent} neither verified nor explained.`
	]
		.filter(Boolean)
		.join(' ');

	if (blocked.length === 0) {
		return tally;
	}

	return [
		tally,
		listed(
			blocked,
			(ac) =>
				`- **${ac.code}** ${clip(ac.text, MAX_TEXT)}\n  - _Not verified: ${clip(ac.blockedReason ?? '', MAX_TEXT)}_`
		)
	].join('\n\n');
}

function decisionsSection(decisions: PlanDecision[]): string {
	if (decisions.length === 0) {
		return '_None recorded._';
	}

	return listed(
		decisions,
		(entry) => `- **${clip(entry.fork, MAX_TEXT)}** → ${clip(entry.chose, MAX_TEXT)}`
	);
}

export function pullRequestBody(opts: {
	plan: Plan;
	acs: Ac[];
	decisions: PlanDecision[];
	verifyReport: string | null;
	planUrl: string;
}): string {
	const body = [
		overview(opts.plan),
		`**[Plan #${opts.plan.number} in bosun](${opts.planUrl})** — the plan, its bullets and every session's output are on the Execution tab.`,
		'## Acceptance criteria',
		criteriaSection(opts.acs),
		'## Decisions taken',
		decisionsSection(opts.decisions),
		// Clipped rather than dropped: the verify bullet's own words are the only
		// account of what was actually driven, and the first of them is the part a
		// reviewer reads. The rest is on the plan with the run that wrote it.
		opts.verifyReport === null
			? ''
			: `## The verify bullet's report\n\n${clip(opts.verifyReport, MAX_REPORT)}`,
		'_Planned and executed by bosun._'
	]
		.filter((section) => section !== '')
		.join('\n\n');

	// Nothing above can add up past the limit as the sections stand, so this is
	// not the mechanism — it is the guarantee. A section that grows later must
	// still not cost somebody their pull request after the push.
	return clip(body, MAX_BODY);
}
