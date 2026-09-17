import { Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

import { PlanStatusBadge, type PlanDetail } from '~/entities/plan'
import { formatRelativeTime } from '~/shared/lib'
import { ChangeMap } from '~/widgets/plan-changes/ui/change-map'

function PullRequest ({ detail }: { detail: PlanDetail }) {
	const { build } = detail

	if (build === null) {
		return null
	}

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap={4}>
				<Group justify="space-between" gap="xs">
					<Text fw={600} size="sm">
						Pull request
					</Text>
					<PlanStatusBadge plan={detail.plan} />
				</Group>

				{build.prUrl === null ? (
					<Text size="sm" c="dimmed">
						Opened once the plan has built, synced and verified.
					</Text>
				) : (
					<Anchor href={build.prUrl} target="_blank" rel="noreferrer" size="sm">
						<Group gap={4} align="center">
							{build.prNumber === null ? 'Open the pull request' : `#${String(build.prNumber)}`}
							<ExternalLink size={12} />
						</Group>
					</Anchor>
				)}

				{build.branch === null ? null : (
					<Text size="xs" c="dimmed" className="font-mono break-all">
						{build.branch}
						{build.baseBranch === null ? '' : ` → ${build.baseBranch}`}
					</Text>
				)}

				{build.mergedAt === null ? null : (
					<Badge color="teal" variant="light" className="self-start">
						merged {formatRelativeTime(build.mergedAt)}
					</Badge>
				)}
			</Stack>
		</Card>
	)
}

export function PlanChanges ({ detail }: { detail: PlanDetail }) {
	return (
		<Stack gap="lg">
			<PullRequest detail={detail} />

			{detail.plan.summary === null ? (
				<Text size="sm" c="dimmed">
					The change map is written once every bullet has landed.
				</Text>
			) : (
				<Stack gap="xs">
					<Group justify="space-between" align="center">
						<Text size="xs" c="dimmed">
							What changed
						</Text>
						{detail.plan.summarisedAt === null ? null : (
							<Text size="xs" c="dimmed">
								{formatRelativeTime(detail.plan.summarisedAt)}
							</Text>
						)}
					</Group>
					<ChangeMap summary={detail.plan.summary} />
				</Stack>
			)}
		</Stack>
	)
}
