import { Alert, Group, Stack, Text } from '@mantine/core'

import type { NeedsYouReason, PlanDetail } from '~/entities/plan'
import { RunQuestionPanel } from '~/features/answer-run'
import { BuildActionButton, RecheckChoice } from '~/features/control-build'
import { OverlapDecisionPanel } from '~/features/decide-overlap'

const REASON_TITLE: Record<Exclude<NeedsYouReason, 'overlap' | 'integration'>, string> = {
	checks: 'The checks are still red after one repair',
	provider_failed: 'A plan this one needs failed',
	recheck_failed: 'A criterion still fails after its fix',
	worktree: 'The build could not start'
}

function NeedsYou ({ detail }: { detail: PlanDetail }) {
	const { build } = detail

	if (build?.status !== 'needs_you' || build.needsYouReason === null || build.needsYouReason === 'overlap') {
		return null
	}

	const failing = [
		...new Set(
			detail.findings.flatMap((finding) =>
				finding.status === 'open' && finding.acCode !== null ? [finding.acCode] : []
			)
		)
	]

	return (
		<Alert
			color="orange"
			variant="light"
			title={
				build.needsYouReason === 'integration'
					? `Sync with ${build.baseBranch ?? 'its base'} failed`
					: REASON_TITLE[build.needsYouReason]
			}
		>
			<Stack gap="xs">
				{build.failureReason === null ? null : (
					<Text size="sm" className="whitespace-pre-wrap">
						{build.failureReason}
					</Text>
				)}

				{build.needsYouReason === 'recheck_failed' ? (
					<RecheckChoice buildId={build.id} failing={failing} />
				) : (
					<Group gap="xs">
						<BuildActionButton buildId={build.id} control="retry" />
						<BuildActionButton buildId={build.id} control="cancel" />
					</Group>
				)}
			</Stack>
		</Alert>
	)
}

// Above the tabs and never inside one: a question or a decision one tab away is one
// that gets missed. Capped so a long list of options cannot squeeze the tabs away —
// against the viewport, because a percentage resolves against the header this sits
// in, which is only as tall as the panels, and the panels then clip their own
// buttons. Nothing inside shrinks: past the cap the stack scrolls.
export function PlanPanels ({ detail }: { detail: PlanDetail }) {
	const openOverlaps = detail.overlapDecisions.some((decision) => decision.chosen === null)
	const stopped = detail.build?.status === 'needs_you'

	if (detail.pendingQuestion === null && !openOverlaps && !stopped) {
		return null
	}

	return (
		<div className="flex max-h-[40vh] shrink-0 flex-col gap-2 overflow-y-auto [&>*]:shrink-0">
			{detail.pendingQuestion === null ? null : (
				<RunQuestionPanel planId={detail.plan.id} pending={detail.pendingQuestion} />
			)}
			<OverlapDecisionPanel decisions={detail.overlapDecisions} />
			<NeedsYou detail={detail} />
		</div>
	)
}
