import { Card, Divider, Stack, Text } from '@mantine/core'

import type { PlanDecision } from '~/entities/plan'

function Line ({ label, value }: { label: string, value: string | null }) {
	return value === null ? null : (
		<Text size="sm">
			<Text component="span" fw={600}>
				{label}:
			</Text>{' '}
			{value}
		</Text>
	)
}

// Shown as they land rather than collected at the end. A queue running overnight
// is watched by somebody who wants to know what it decided while it decides it,
// not by somebody waiting for a pull request to find out.
export function PlanDecisions ({ decisions }: { decisions: PlanDecision[] }) {
	if (decisions.length === 0) {
		return null
	}

	return (
		<>
			<Divider label="Decisions taken" labelPosition="left" />

			<Stack gap="sm">
				{decisions.map((decision) => (
					<Card key={decision.id} withBorder padding="sm" radius="md">
						<Stack gap={4}>
							<Text fw={600}>{decision.fork}</Text>
							<Line label="Options" value={decision.options} />
							<Line label="Chose" value={decision.chose} />
							<Line label="Blast radius" value={decision.blastRadius} />
							<Line label="Reversing it" value={decision.reversing} />
						</Stack>
					</Card>
				))}
			</Stack>
		</>
	)
}
