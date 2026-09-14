import { Badge, Checkbox, Divider, Group, Stack, Text, Title } from '@mantine/core'

import type { Ac, DependencyView, Plan, PlanAmendment, PlanDecision, Slice } from '~/entities/plan'
import { MarkdownBlock } from '~/shared/ui'
import { PlanDecisions } from '~/widgets/plan-artifact/ui/plan-decisions'
import { PlanDependencies } from '~/widgets/plan-artifact/ui/plan-dependencies'
import { SliceCard } from '~/widgets/plan-artifact/ui/slice-card'

function AcLine ({ ac, verifyInUi }: { ac: Ac, verifyInUi: boolean }) {
	// A criterion nobody could drive is neither a pass nor a defect, and showing it
	// as an empty box says only the first half. The reason is the half that matters.
	const blocked = verifyInUi && !ac.verified && ac.blockedReason != null

	return (
		<Group gap="sm" align="start">
			<Badge variant="light" className="shrink-0">
				{ac.code}
			</Badge>

			<Stack gap={2} className="min-w-40 grow">
				<Text size="sm">{ac.text}</Text>
				{blocked ? (
					<Text size="xs" c="orange">
						Not verified — {ac.blockedReason}
					</Text>
				) : null}
			</Stack>

			{/* Ticked by the sessions, never here: the boxes report what the build and
			    verify bullets have actually done, so a click would be a lie. */}
			<Group gap="md" wrap="nowrap" className="shrink-0">
				<Checkbox size="xs" readOnly label="implemented" checked={ac.implemented} />
				{verifyInUi ? (
					<Checkbox size="xs" readOnly label="verified" checked={ac.verified} />
				) : null}
			</Group>
		</Group>
	)
}

// Read-only by design. The plan is what the sessions were briefed with, and a
// browser that can reorder its bullets or reword a criterion is a second author
// nobody downstream knows about.
export function PlanArtifact ({
	plan,
	acs,
	slices,
	decisions,
	dependencies,
	amendments,
	buildId
}: {
	plan: Plan
	acs: Ac[]
	slices: Slice[]
	decisions: PlanDecision[]
	dependencies: DependencyView[]
	amendments: PlanAmendment[]
	buildId: string | null
}) {
	return (
		<Stack gap="lg">
			<Group gap="sm">
				<Title order={2}>{plan.title ?? 'Untitled'}</Title>
				{plan.handsOff ? (
					<Badge variant="light" color="gray">
						hands-off
					</Badge>
				) : null}
			</Group>

			{plan.bodyMd === null ? null : <MarkdownBlock source={plan.bodyMd} />}

			<PlanDependencies dependencies={dependencies} amendments={amendments} buildId={buildId} />

			<Divider label="Acceptance criteria" labelPosition="left" />

			<Stack gap="sm">
				{acs.map((ac) => (
					<AcLine key={ac.id} ac={ac} verifyInUi={plan.verifyInUi} />
				))}
			</Stack>

			<Divider label="Tracer bullets" labelPosition="left" />

			<Stack gap="sm">
				{slices.map((slice) => (
					<SliceCard key={slice.id} slice={slice} acs={acs} />
				))}
			</Stack>

			<PlanDecisions decisions={decisions} />
		</Stack>
	)
}
