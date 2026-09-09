import { Badge, Card, Group, Stack, Text } from '@mantine/core'

import type { PlanSummary, PlanSummaryEntry } from '~/entities/plan'

const KIND_COLOR: Record<PlanSummaryEntry['kind'], string> = {
	added: 'green',
	changed: 'blue',
	removed: 'red'
}

export function ChangeMap ({ summary }: { summary: PlanSummary }) {
	return (
		<Stack gap="md">
			<Text size="sm">{summary.headline}</Text>

			{summary.areas.map((area) => (
				<Card key={area.name} withBorder radius="md" padding="md">
					<Stack gap="xs">
						<div>
							<Text fw={600} size="sm">
								{area.name}
							</Text>
							<Text size="xs" c="dimmed">
								{area.why}
							</Text>
						</div>

						{area.entries.map((entry) => (
							<Group key={entry.path} gap="xs" align="start" wrap="nowrap">
								<Badge size="xs" variant="light" color={KIND_COLOR[entry.kind]} w={72}>
									{entry.kind}
								</Badge>
								<div className="min-w-0">
									<Text size="xs" className="font-mono break-all">
										{entry.path}
									</Text>
									<Text size="xs" c="dimmed">
										{entry.note}
									</Text>
								</div>
							</Group>
						))}
					</Stack>
				</Card>
			))}
		</Stack>
	)
}
