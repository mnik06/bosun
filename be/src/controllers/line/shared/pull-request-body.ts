import { type Integration, type VerifyFinding } from 'src/types/BuildSchema';
import { type Ac, type Plan, type PlanDecision } from 'src/types/PlanSchema';
import { clip } from 'src/utils/general';

// GitHub refuses a body over 65536 characters, and it refuses it *after* the
// branch is pushed — the work lands and the pull request does not exist. So the
// pull request carries the verdict and bosun carries the detail: what shipped,
// whether the criteria held, what was decided, what integration did to it, and the
// gaps somebody accepted. Everything else is one link away.
const MAX_BODY = 60_000;
const MAX_OVERVIEW = 800;
const MAX_REPORT = 4_000;
const MAX_TEXT = 160;
const MAX_LISTED = 10;
const MAX_DIFF = 3_000;

interface KnownGap {
	code: string;
	text: string;
	reproduction: string;
	acceptedBy: string | null;
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
// drive: that one is named here with its reason.
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

function knownGapsSection(gaps: KnownGap[]): string {
	return gaps.length === 0
		? ''
		: `## Known gaps\n\n${listed(
			gaps,
			(gap) =>
				`- **${gap.code}** ${clip(gap.text, MAX_TEXT)}\n  - _Failed re-check: ${clip(gap.reproduction, MAX_TEXT)}_${gap.acceptedBy === null ? '' : ` — accepted by ${gap.acceptedBy}`}`
		)}`;
}

function leftFindingsSection(findings: VerifyFinding[]): string {
	return findings.length === 0
		? ''
		: `## Findings left\n\n${listed(
			findings,
			(finding) =>
				`- ${finding.acCode === null ? finding.kind : `**${finding.acCode}**`}: ${clip(finding.reproduction, MAX_TEXT)}${finding.note === null ? '' : `\n  - _${clip(finding.note, MAX_TEXT)}_`}`
		)}`;
}

function integrationLine(integration: Integration): string {
	const onto = `\`${integration.onto}\`${integration.ontoSha === null ? '' : ` at ${integration.ontoSha.slice(0, 8)}`}`;
	const regenerated = integration.regenerated
		.filter((entry) => entry.files.length > 0)
		.map((entry) => `regenerated ${entry.name} (${entry.files.map((file) => `\`${file}\``).join(', ')})`);
	const resolved = integration.resolved.map(
		(entry) => `<details><summary>resolved \`${entry.file}\`</summary>\n\n\`\`\`diff\n${clip(entry.diff, MAX_DIFF)}\n\`\`\`\n</details>`
	);
	const what = [integration.merged ? `merged ${onto}` : `${onto} already contained`, ...regenerated].join('; ');

	return [`- ${what}${integration.checks === null ? '' : ` — checks ${integration.checks}`}`, ...resolved].join('\n');
}

// Every integration, with the diff of each conflict bosun resolved: a session that
// resolved one wrongly and passed the checks is visible here, and only here.
function integrationsSection(integrations: Integration[]): string {
	const done = integrations.filter((integration) => integration.status === 'done');

	return done.length === 0 ? '' : `## Syncs\n\n${done.slice(-MAX_LISTED).map(integrationLine).join('\n')}`;
}

export function pullRequestBody(opts: {
	plan: Plan;
	acs: Ac[];
	decisions: PlanDecision[];
	verifyReport: string | null;
	planUrl: string;
	integrations?: Integration[];
	knownGaps?: KnownGap[];
	leftFindings?: VerifyFinding[];
}): string {
	const body = [
		overview(opts.plan),
		`**[Plan #${opts.plan.number} in bosun](${opts.planUrl})** — the plan, its bullets and every session's output are on the plan page.`,
		'## Acceptance criteria',
		criteriaSection(opts.acs),
		knownGapsSection(opts.knownGaps ?? []),
		'## Decisions taken',
		decisionsSection(opts.decisions),
		leftFindingsSection(opts.leftFindings ?? []),
		integrationsSection(opts.integrations ?? []),
		// Clipped rather than dropped: the verify report is the only account of what
		// was actually driven, and the first of it is the part a reviewer reads.
		opts.verifyReport === null ? '' : `## The verify report\n\n${clip(opts.verifyReport, MAX_REPORT)}`,
		'_Planned and executed by bosun._'
	]
		.filter((section) => section !== '')
		.join('\n\n');

	// Nothing above adds up past the limit as the sections stand, so this is not the
	// mechanism — it is the guarantee.
	return clip(body, MAX_BODY);
}
