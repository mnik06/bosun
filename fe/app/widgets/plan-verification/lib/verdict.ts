import type { Ac, VerifyFinding } from '~/entities/plan'

export interface Verdict {
	label: string
	color: string
	detail: string | null
}

// The most recent word on a criterion wins: an accepted gap outranks the finding it
// accepts, a pass outranks the fix that led to it, and a finding still open is a
// failure whatever an earlier drive said.
export function criterionVerdict (opts: { ac: Ac, findings: VerifyFinding[] }): Verdict {
	const own = opts.findings
		.filter((finding) => finding.acCode === opts.ac.code)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
	const accepted = own.find((finding) => finding.status === 'accepted')
	const open = own.find((finding) => finding.status === 'open' || finding.status === 'left')

	if (accepted !== undefined) {
		return { label: 'accepted as a known gap', color: 'orange', detail: accepted.reproduction }
	}

	if (opts.ac.verified) {
		return own.some((finding) => finding.status === 'fixed')
			? { label: 'failed, then fixed', color: 'teal', detail: null }
			: { label: 'verified', color: 'green', detail: null }
	}

	if (open !== undefined) {
		return { label: 'failing', color: 'red', detail: open.note ?? open.reproduction }
	}

	if (opts.ac.blockedReason !== null) {
		return { label: 'blocked', color: 'yellow', detail: opts.ac.blockedReason }
	}

	return { label: 'not driven yet', color: 'gray', detail: null }
}
