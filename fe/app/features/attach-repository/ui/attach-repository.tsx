import { Anchor, Button, Group, Select, Tooltip } from '@mantine/core'
import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { Machine } from '~/entities/machine'
import {
	useAvailableRepositoriesQuery,
	useGithubInstallationsQuery,
	type AvailableRepository
} from '~/entities/repository'
import { useAttachRepository } from '~/features/attach-repository/api/use-attach-repository'

function repositoryOption (repository: AvailableRepository): { value: string, label: string } {
	return {
		value: String(repository.githubRepoId),
		label: repository.private ? `${repository.fullName} (private)` : repository.fullName
	}
}

export function AttachRepository ({ machine }: { machine: Pick<Machine, 'id' | 'status'> }) {
	const installations = useGithubInstallationsQuery()
	const connected = (installations.data ?? []).length > 0
	const available = useAvailableRepositoriesQuery({ enabled: connected })
	const attach = useAttachRepository(machine.id)
	const [selected, setSelected] = useState<string | null>(null)
	const offline = machine.status !== 'online'

	if (installations.isSuccess && !connected) {
		return (
			<Anchor component={Link} to="/settings" size="sm">
				Connect GitHub in Settings
			</Anchor>
		)
	}

	return (
		<Group gap="xs" wrap="wrap" className="min-w-0">
			<Select
				aria-label="Repository"
				size="xs"
				className="w-64 max-w-full"
				searchable
				nothingFoundMessage="No repository matches"
				placeholder={available.isFetching ? 'Loading…' : 'Pick a repository'}
				data={(available.data ?? []).map(repositoryOption)}
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
						if (selected !== null) {
							attach.mutate(Number(selected), {
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
