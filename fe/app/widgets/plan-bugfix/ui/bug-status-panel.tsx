import { Badge, Card, Stack, Text } from '@mantine/core'

import type { PlanBug } from '~/entities/plan'

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
		<Card withBorder padding="sm" radius="md">
			<Stack gap={4}>
				<Badge size="xs" variant="filled" color={STATUS_COLOR[bug.status]} className="self-start">
					{bug.status}
				</Badge>
				<Text size="sm" className="whitespace-pre-wrap">
					{bug.description}
				</Text>
				{bug.note === null ? null : (
					<Text size="xs" c="dimmed" className="whitespace-pre-wrap">
						{bug.note}
					</Text>
				)}
			</Stack>
		</Card>
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
