import { Card, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { PlanStatusBadge } from '~/entities/plan/ui/plan-status-badge'
import type { PlanListEntry } from '~/entities/plan/model/plan'
import { formatRelativeTime } from '~/shared/lib'

export function PlanRowCard ({ entry }: { entry: PlanListEntry }) {
	return (
		<Card withBorder padding="md" radius="md" component={Link} to={`/plans/${entry.id}`}>
			<Group justify="space-between" align="start" gap="sm" wrap="nowrap">
				<Stack gap={2} className="min-w-0">
					<Text fw={600} truncate>
						<Text component="span" c="dimmed" fw={500}>
							#{entry.number}
						</Text>{' '}
						{entry.title ?? 'Untitled'}
					</Text>
					<Text size="xs" c="dimmed">
						{entry.ownerEmail ?? 'unknown'} · {formatRelativeTime(entry.build?.finishedAt ?? entry.createdAt)}
						{entry.build?.prNumber == null ? '' : ` · PR #${String(entry.build.prNumber)}`}
					</Text>
				</Stack>
				<PlanStatusBadge plan={entry} />
			</Group>
		</Card>
	)
}
