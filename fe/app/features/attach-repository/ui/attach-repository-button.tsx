import { Anchor, Button, Select, Stack, Text, Tooltip } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { Machine } from '~/entities/machine'
import { useRepositoriesQuery } from '~/entities/repository'
import { useAttachRepository } from '~/features/attach-repository/api/use-attach-repository'
import { AppModal } from '~/shared/ui'

function AttachForm ({ machineId, onDone }: { machineId: string, onDone: () => void }) {
	const repositories = useRepositoriesQuery()
	const attach = useAttachRepository(machineId)
	const [repositoryId, setRepositoryId] = useState<string | null>(null)

	if (!repositories.isPending && (repositories.data ?? []).length === 0) {
		return (
			<Text size="sm">
				This project has no repositories yet.{' '}
				<Anchor component={Link} to="/repositories">
					Connect GitHub and add one
				</Anchor>{' '}
				first.
			</Text>
		)
	}

	return (
		<Stack gap="md">
			<Select
				label="Repository"
				placeholder={repositories.isPending ? 'Loading…' : 'Pick a repository'}
				description="The agent clones its default branch into ~/.bosun/repos and works only there. One repository per machine."
				data={(repositories.data ?? []).map((repository) => ({
					value: repository.id,
					label: repository.fullName
				}))}
				value={repositoryId}
				onChange={setRepositoryId}
			/>

			<Button
				loading={attach.isPending}
				disabled={repositoryId === null}
				onClick={() => {
					if (repositoryId !== null) {
						attach.mutate(repositoryId, { onSuccess: onDone })
					}
				}}
			>
				Attach and clone
			</Button>
		</Stack>
	)
}

export function AttachRepositoryButton ({ machine }: { machine: Pick<Machine, 'id' | 'status'> }) {
	const [opened, { open, close }] = useDisclosure(false)
	const offline = machine.status !== 'online'

	return (
		<>
			<Tooltip label="The machine must be online — its agent does the clone" disabled={!offline}>
				<Button
					variant="light"
					size="xs"
					leftSection={<GitBranch size={14} />}
					disabled={offline}
					onClick={open}
				>
					Attach repository
				</Button>
			</Tooltip>

			<AppModal opened={opened} onClose={close} title="Attach a repository">
				<AttachForm machineId={machine.id} onDone={close} />
			</AppModal>
		</>
	)
}
