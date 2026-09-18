import { Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

import { PlanStatusBadge, type PlanDetail } from '~/entities/plan'
import { useGithubPatConnectionsQuery, useRepositoriesQuery } from '~/entities/repository'
import { useActiveProject } from '~/entities/project'
import { formatRelativeTime } from '~/shared/lib'
import { ChangeMap } from '~/widgets/plan-changes/ui/change-map'

// Only leaders can list PAT connections (`/github` is leader-only), so a
// developer sees the pull request without the attribution line rather than a
// failed request — the same boundary `github-settings.tsx` already draws.
function usePatOwner (repositoryId: string): string | null {
	const { isLeader } = useActiveProject()
	const repositories = useRepositoriesQuery()
	const patConnections = useGithubPatConnectionsQuery({ enabled: isLeader })
	const repository = repositories.data?.find((entry) => entry.id === repositoryId)

	if (repository?.githubPatConnectionId == null) {
		return null
	}

	return patConnections.data?.find((connection) => connection.id === repository.githubPatConnectionId)?.githubLogin ?? null
}

function PullRequest ({ detail }: { detail: PlanDetail }) {
	const { build } = detail
	const patOwner = usePatOwner(build?.repositoryId ?? '')

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

				{build.prUrl === null || patOwner === null ? null : (
					<Stack gap={0}>
						<Text size="xs" c="dimmed">
							Opened by {patOwner} via personal token.
						</Text>
						<Text size="xs" c="dimmed">
							Branch protection may block {patOwner} from approving their own pull request — merge it
							yourself if so.
						</Text>
					</Stack>
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
