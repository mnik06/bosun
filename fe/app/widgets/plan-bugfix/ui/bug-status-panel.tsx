import { Stack, Text } from '@mantine/core'

import type { PlanBug } from '~/entities/plan'
import { StatusCard } from '~/shared/ui'

// Styled the same as `plan-verification`'s `FindingCard`: a badge, the text, and
// an optional note, so a bug reads as the same kind of thing a finding does.
const STATUS_COLOR: Record<PlanBug['status'], string> = {
	pending: 'gray',
	fixing: 'blue',
	fixed: 'green',
	failed: 'red'
}

function BugCard ({ bug }: { bug: PlanBug }) {
	return (
		<StatusCard
			badges={[{ label: bug.status, color: STATUS_COLOR[bug.status], variant: 'filled' }]}
			body={bug.description}
			note={bug.note}
		/>
	)
}

export function BugStatusPanel ({ bugs }: { bugs: PlanBug[] }) {
	if (bugs.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				Paste a list of bugs into the chat and they will show up here as they are found and fixed.
			</Text>
		)
	}

	return (
		<Stack gap="sm">
			{bugs.map((bug) => (
				<BugCard key={bug.id} bug={bug} />
			))}
		</Stack>
	)
}
