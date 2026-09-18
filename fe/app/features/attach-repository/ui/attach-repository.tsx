import { Anchor, Button, Group, Select, Tooltip } from '@mantine/core'
import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { Machine } from '~/entities/machine'
import {
	useAvailableAzureRepositoriesQuery,
	useAvailableRepositoriesQuery,
	useAzureConnectionsQuery,
	useGithubInstallationsQuery,
	useGithubPatConnectionsQuery,
	type AvailableAzureRepository,
	type AvailableRepository
} from '~/entities/repository'
import { useAttachRepository, type AttachRepositoryInput } from '~/features/attach-repository/api/use-attach-repository'

const GITHUB_PREFIX = 'github:'
const AZURE_PREFIX = 'azure:'

// "GitHub App · {accountLogin}" / "Personal token · {githubLogin}" (AC-20).
function connectionLabel (connection: AvailableRepository['connection']): string {
	return connection.kind === 'app' ? `GitHub App · ${connection.accountLogin}` : `Personal token · ${connection.githubLogin}`
}

function githubOption (repository: AvailableRepository): { value: string, label: string } {
	const name = repository.private ? `${repository.fullName} (private)` : repository.fullName

	return {
		value: `${GITHUB_PREFIX}${repository.githubRepoId}`,
		label: `${name} — ${connectionLabel(repository.connection)}`
	}
}

// "{repo} — {org}/{project}" (AC-28) rather than the fully qualified
// `fullName`, which already reads as "{org}/{project}/{repo}" and would repeat
// the organization and project twice in one label.
function azureOption (repository: AvailableAzureRepository): { value: string, label: string } {
	const repoName = repository.fullName.split('/').at(-1) ?? repository.fullName

	return {
		value: `${AZURE_PREFIX}${repository.azureConnectionId}:${repository.azureProjectId}:${repository.azureRepoId}`,
		label: `${repoName} — ${repository.organization}/${repository.azureProjectName}`
	}
}

function inputFor (value: string): AttachRepositoryInput | null {
	if (value.startsWith(GITHUB_PREFIX)) {
		return { provider: 'github', githubRepoId: Number(value.slice(GITHUB_PREFIX.length)) }
	}

	if (value.startsWith(AZURE_PREFIX)) {
		const [azureConnectionId, azureProjectId, azureRepoId] = value.slice(AZURE_PREFIX.length).split(':')

		if (azureConnectionId === undefined || azureProjectId === undefined || azureRepoId === undefined) {
			return null
		}

		return { provider: 'azure_devops', azureConnectionId, azureProjectId, azureRepoId }
	}

	return null
}

export function AttachRepository ({ machine }: { machine: Pick<Machine, 'id' | 'status'> }) {
	const installations = useGithubInstallationsQuery()
	const patConnections = useGithubPatConnectionsQuery()
	const azureConnections = useAzureConnectionsQuery()
	const githubConnected = (installations.data ?? []).length > 0 || (patConnections.data ?? []).length > 0
	const azureConnected = (azureConnections.data ?? []).length > 0
	const connected = githubConnected || azureConnected
	const available = useAvailableRepositoriesQuery({ enabled: githubConnected })
	const availableAzure = useAvailableAzureRepositoriesQuery({ enabled: azureConnected })
	const attach = useAttachRepository(machine.id)
	const [selected, setSelected] = useState<string | null>(null)
	const offline = machine.status !== 'online'
	const loading = (githubConnected && available.isFetching) || (azureConnected && availableAzure.isFetching)

	if ((installations.isSuccess || patConnections.isSuccess || azureConnections.isSuccess) && !connected) {
		return (
			<Anchor component={Link} to="/settings" size="sm">
				Connect GitHub or Azure DevOps in Settings
			</Anchor>
		)
	}

	const options = [...(available.data ?? []).map(githubOption), ...(availableAzure.data ?? []).map(azureOption)]

	return (
		<Group gap="xs" wrap="wrap" className="min-w-0">
			<Select
				aria-label="Repository"
				size="xs"
				className="w-64 max-w-full"
				searchable
				nothingFoundMessage="No repository matches"
				placeholder={loading ? 'Loading…' : 'Pick a repository'}
				data={options}
				value={selected}
				onChange={setSelected}
			/>

			<Tooltip label="The machine must be online — its agent does the clone" disabled={!offline}>
				<Button
					variant="light"
					size="xs"
					leftSection={<GitBranch size={14} />}
					disabled={offline || selected === null}
					loading={attach.isPending}
					onClick={() => {
						const input = selected === null ? null : inputFor(selected)

						if (input !== null) {
							attach.mutate(input, {
								onSuccess: () => {
									setSelected(null)
								}
							})
						}
					}}
				>
					Attach
				</Button>
			</Tooltip>
		</Group>
	)
}
