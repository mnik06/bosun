import { Card, Divider, Stack, Text, Title } from '@mantine/core'

import type { Ac, Plan, PlanDecision, Slice } from '~/entities/plan'
import { PlanDecisions } from '~/widgets/plan-artifact/ui/plan-decisions'
import { AcRow, AddSliceButton, SliceCard } from '~/features/edit-artifact'
import { EditablePlanBody, EditablePlanTitle } from '~/features/edit-plan'

export function PlanArtifact ({
	plan,
	acs,
	slices,
	decisions,
	editable
}: {
	plan: Plan
	acs: Ac[]
	slices: Slice[]
	decisions: PlanDecision[]
	editable: boolean
}) {
	const unassigned = acs.filter((ac) => ac.sliceId === null)
	const readOnlyBody =
		plan.bodyMd === null ? null : (
			<Text size="sm" className="whitespace-pre-wrap">
				{plan.bodyMd}
			</Text>
		)

	if (plan.title === null && acs.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				The plan appears here as the session writes it.
			</Text>
		)
	}

	return (
		<Stack gap="lg">
			{editable ? (
				<EditablePlanTitle plan={plan} />
			) : (
				<Title order={2}>{plan.title ?? 'Untitled'}</Title>
			)}

			{editable ? <EditablePlanBody plan={plan} /> : readOnlyBody}

			{unassigned.length === 0 ? null : (
				<Card withBorder padding="md" radius="md">
					<Stack gap="xs">
						<Text fw={600} size="sm">
							Not yet claimed by a tracer bullet
						</Text>
						{unassigned.map((ac) => (
							<AcRow key={ac.id} planId={plan.id} ac={ac} slices={slices} editable={editable} />
						))}
					</Stack>
				</Card>
			)}

			{slices.length === 0 ? null : <Divider label="Tracer bullets" labelPosition="left" />}

			<Stack gap="sm">
				{slices.map((slice) => (
					<SliceCard
						key={slice.id}
						planId={plan.id}
						slice={slice}
						slices={slices}
						acs={acs}
						editable={editable}
					/>
				))}

				{editable ? <AddSliceButton planId={plan.id} /> : null}
			</Stack>
			<PlanDecisions decisions={decisions} />
		</Stack>
	)
}
