import { Badge, Card, Code, Group, Loader, Stack, Text } from '@mantine/core'

import { useIntegrationActivity, type Integration } from '~/entities/plan'
import { formatRelativeTime } from '~/shared/lib'

const TRIGGER_LABEL: Record<Integration['trigger'], string> = {
	built: 'After building',
	base_moved: 'The base branch moved',
	provider_moved: 'The plan it stacks on moved',
	retarget: 'The plan it stacked on merged'
}

const STATUS_COLOR: Record<Integration['status'], string> = {
	pending: 'gray',
	running: 'blue',
	done: 'green',
	needs_you: 'orange'
}

function Regenerated ({ integration }: { integration: Integration }) {
	return integration.regenerated.length === 0 ? null : (
		<Stack gap={4}>
			<Text size="xs" c="dimmed">
				Regenerated
			</Text>
			{integration.regenerated.map((rule) => (
				<Text key={rule.name} size="xs">
					<strong>{rule.name}</strong>
					{rule.files.length === 0 ? ' — nothing changed' : ':'}{' '}
					<span className="font-mono break-all">{rule.files.join(', ')}</span>
				</Text>
			))}
		</Stack>
	)
}

// The resolved diff is the reviewer's only way to check a session's merge — a
// conflict resolved wrongly can still pass every check.
function Resolved ({ integration }: { integration: Integration }) {
	return integration.resolved.length === 0 ? null : (
		<Stack gap={4}>
			<Text size="xs" c="dimmed">
				Conflicts resolved by a session
			</Text>
			{integration.resolved.map((conflict) => (
				<Stack key={conflict.file} gap={2}>
					<Text size="xs" className="font-mono break-all">
						{conflict.file}
					</Text>
					<div className="overflow-x-auto">
						<Code block className="text-xs">
							{conflict.diff}
						</Code>
					</div>
				</Stack>
			))}
		</Stack>
	)
}

export function IntegrationCard ({ integration }: { integration: Integration }) {
	const activity = useIntegrationActivity()[integration.id]

	return (
		<Card withBorder padding="sm" radius="md">
			<Stack gap="xs">
				<Group justify="space-between" gap="xs">
					<Group gap="xs">
						<Text size="sm" fw={600}>
							{TRIGGER_LABEL[integration.trigger]}
						</Text>
						<Text size="xs" c="dimmed" className="font-mono">
							onto {integration.onto}
							{integration.ontoSha === null ? '' : ` @ ${integration.ontoSha.slice(0, 8)}`}
						</Text>
					</Group>
					<Group gap="xs">
						{integration.checks === null ? null : (
							<Badge size="xs" variant="outline" color={integration.checks === 'failed' ? 'red' : 'gray'}>
								checks {integration.checks}
							</Badge>
						)}
						<Badge size="xs" variant="light" color={STATUS_COLOR[integration.status]}>
							{integration.status.replace('_', ' ')}
						</Badge>
						<Text size="xs" c="dimmed">
							{formatRelativeTime(integration.finishedAt ?? integration.createdAt)}
						</Text>
					</Group>
				</Group>

				{integration.status === 'running' ? (
					<Group gap="xs">
						<Loader size={12} />
						<Text size="xs" c="dimmed">
							{activity ?? 'Integrating…'}
						</Text>
					</Group>
				) : null}

				{integration.status === 'done' && !integration.merged ? (
					<Text size="xs" c="dimmed">
						Already up to date — nothing to merge.
					</Text>
				) : null}

				<Regenerated integration={integration} />
				<Resolved integration={integration} />

				{integration.detail === null ? null : (
					<Text size="xs" c={integration.status === 'needs_you' ? 'orange' : 'dimmed'} className="whitespace-pre-wrap">
						{integration.detail}
					</Text>
				)}
			</Stack>
		</Card>
	)
}
