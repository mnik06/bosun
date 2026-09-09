import { Badge, Card, Checkbox, Divider, Group, Stack, Text, Title } from '@mantine/core'

import type { Ac, Plan, PlanDecision, Slice } from '~/entities/plan'
import { MarkdownBlock } from '~/shared/ui'
import { PlanDecisions } from '~/widgets/plan-artifact/ui/plan-decisions'

const VERIFY_JOB =
	'Drives every acceptance criterion through the running product and repairs what it finds broken. It builds nothing of its own.'

function AcLine ({ ac, verifyInUi }: { ac: Ac, verifyInUi: boolean }) {
	return (
		<Group gap="sm" align="start">
			<Badge variant="light" className="shrink-0">
				{ac.code}
			</Badge>

			<Text size="sm" className="min-w-40 grow">
				{ac.text}
			</Text>

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

function SliceCard ({ slice, acs }: { slice: Slice, acs: Ac[] }) {
	const claimed = acs.filter((ac) => ac.sliceId === slice.id)

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group gap="xs">
					<Text fw={600}>
						{slice.ordinal}. {slice.title}
					</Text>
					{slice.kind === 'verify' ? (
						<Badge variant="light" color="grape">
							verify
						</Badge>
					) : null}
				</Group>

				{slice.kind === 'verify' ? (
					<Text size="sm" c="dimmed">
						{VERIFY_JOB}
					</Text>
				) : (
					<>
						{slice.bodyMd === null ? null : <MarkdownBlock source={slice.bodyMd} />}

						{claimed.length === 0 ? null : (
							<Group gap="xs">
								{claimed.map((ac) => (
									<Badge key={ac.id} size="sm" variant="outline">
										{ac.code}
									</Badge>
								))}
							</Group>
						)}
					</>
				)}
			</Stack>
		</Card>
	)
}

// Read-only by design. The plan is what the sessions were briefed with, and a
// browser that can reorder its bullets or reword a criterion is a second author
// nobody downstream knows about.
export function PlanArtifact ({
	plan,
	acs,
	slices,
	decisions
}: {
	plan: Plan
	acs: Ac[]
	slices: Slice[]
	decisions: PlanDecision[]
}) {
	return (
		<Stack gap="lg">
			<Title order={2}>{plan.title ?? 'Untitled'}</Title>

			{plan.bodyMd === null ? null : <MarkdownBlock source={plan.bodyMd} />}

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
