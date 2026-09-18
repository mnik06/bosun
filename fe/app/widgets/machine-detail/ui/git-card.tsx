import { Anchor, Card, Divider, Group, Stack, Text } from '@mantine/core'

import { machineKind, type Machine } from '~/entities/machine'
import {
	repositoryHostUrl,
	useGithubPatConnectionsQuery,
	useRepositoriesQuery,
	type GithubPatConnection,
	type Repository
} from '~/entities/repository'
import { SetupGithubButton } from '~/features/setup-github'
import { formatRelativeTime } from '~/shared/lib'

// Same interval `RECONCILE_MS` runs on the backend (be/src/controllers/github/reconcile-pull-requests.ts).
const POLL_INTERVAL_LABEL = 'every 5 minutes'

function azureSyncDescription (repository: Repository): string {
	const lastSynced = `Last synced ${formatRelativeTime(repository.lastSyncedAt)}.`

	if (repository.azureSyncMode === 'polling') {
		return `${lastSynced} Webhooks could not be set up for this token, so bosun polls for changes ${POLL_INTERVAL_LABEL}.`
	}

	return `${lastSynced} Synced via webhook, with a polling check ${POLL_INTERVAL_LABEL} as a backup.`
}

// Machine detail is leader-only (`leader-layout.tsx`), the same boundary
// `/github/pat-connections` itself draws, so this can fetch unconditionally.
function githubSyncDescription (repository: Repository, patConnections: GithubPatConnection[] | undefined): string {
	if (repository.githubPatConnectionId === null) {
		return 'Cloned into ~/.bosun/repos on the machine. Fetches and pushes use an hour-long token for this one repository, and pull requests are opened through the GitHub App — nothing to set up on the box.'
	}

	const owner = patConnections?.find((connection) => connection.id === repository.githubPatConnectionId)?.githubLogin ?? 'its owner'
	const lastSynced = `Last synced ${formatRelativeTime(repository.lastSyncedAt)}.`
	const sync = repository.syncMode === 'polling'
		? `Webhooks could not be set up for this token, so bosun polls for changes ${POLL_INTERVAL_LABEL}.`
		: `Synced via webhook, with a polling check ${POLL_INTERVAL_LABEL} as a backup.`

	return `Cloned into ~/.bosun/repos on the machine. Fetches and pushes use ${owner}'s personal access token, and pull requests are opened as ${owner} — nothing to set up on the box. ${lastSynced} ${sync}`
}

function syncDescription (repository: Repository | undefined, patConnections: GithubPatConnection[] | undefined): string {
	if (repository === undefined) {
		return 'Cloned into ~/.bosun/repos on the machine. Fetches and pushes use an hour-long token for this one repository, and pull requests are opened through the GitHub App — nothing to set up on the box.'
	}

	return repository.provider === 'azure_devops' ? azureSyncDescription(repository) : githubSyncDescription(repository, patConnections)
}

// One provider today. The card is a list because the second one — GitLab,
// Bitbucket — is a row here and nothing else, rather than a rewrite of the card.
const PROVIDERS = [
	{
		id: 'github',
		name: 'GitHub',
		description: 'gh holds the credential on the machine and opens the pull request.',
		Action: SetupGithubButton
	}
]

function LegacyProviders ({ machineName }: { machineName: string }) {
	return (
		<>
			{PROVIDERS.map((provider) => (
				<Group key={provider.id} justify="space-between" align="center" gap="sm">
					<Stack gap={2}>
						<Text size="sm" fw={500}>
							{provider.name}
						</Text>
						<Text size="xs" c="dimmed">
							{provider.description}
						</Text>
					</Stack>

					<provider.Action machineName={machineName} />
				</Group>
			))}
		</>
	)
}

function AttachedRepository ({ machine }: { machine: Machine }) {
	const repositories = useRepositoriesQuery()
	const patConnections = useGithubPatConnectionsQuery()

	if (machine.repositoryId == null) {
		return (
			<Text size="sm" c="dimmed">
				No repository attached — pick one in the Repository row above. Until one is, this machine is not
				offered for plans.
			</Text>
		)
	}

	const repository = repositories.data?.find((entry) => entry.id === machine.repositoryId)

	return (
		<Stack gap={2}>
			{repository === undefined ? (
				<Text size="sm" fw={500}>
					Attached repository
				</Text>
			) : (
				<Anchor
					href={repositoryHostUrl(repository)}
					target="_blank"
					rel="noreferrer"
					size="sm"
					fw={500}
					className="break-all"
				>
					{repository.fullName}
				</Anchor>
			)}
			<Text size="xs" c="dimmed">
				{syncDescription(repository, patConnections.data)}
			</Text>
		</Stack>
	)
}

export function GitCard ({ machine }: { machine: Machine }) {
	const legacy = machineKind(machine) === 'legacy'

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Stack gap={2}>
					<Text fw={600}>Git</Text>
					<Text size="sm" c="dimmed">
						{legacy
							? 'Where this machine pushes branches. Plans are built only on a machine with a repository attached, so this one can plan but not build.'
							: 'The repository this machine works on. One per machine.'}
					</Text>
				</Stack>

				<Divider />

				{legacy ? <LegacyProviders machineName={machine.name} /> : <AttachedRepository machine={machine} />}
			</Stack>
		</Card>
	)
}
