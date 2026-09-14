import { Button, Group, Select, Text } from '@mantine/core'
import { useState } from 'react'

import { useAvailableRepositoriesQuery, useRepositoriesQuery } from '~/entities/repository'
import { useAddRepository } from '~/features/add-repository/api/use-add-repository'

export function AddRepositoryForm ({ enabled }: { enabled: boolean }) {
	const available = useAvailableRepositoriesQuery({ enabled })
	const repositories = useRepositoriesQuery()
	const add = useAddRepository()
	const [selected, setSelected] = useState<string | null>(null)

	const added = new Set((repositories.data ?? []).map((repository) => repository.githubRepoId))
	const options = (available.data ?? [])
		.filter((repository) => !added.has(repository.githubRepoId))
		.map((repository) => ({
			value: String(repository.githubRepoId),
			label: repository.private ? `${repository.fullName} (private)` : repository.fullName
		}))

	if (!enabled) {
		return (
			<Text size="sm" c="dimmed">
				Connect GitHub first — the picker lists what the installation grants.
			</Text>
		)
	}

	return (
		<Group align="end" gap="sm" wrap="wrap">
			<Select
				className="min-w-0 flex-1"
				label="Add a repository"
				placeholder={available.isPending ? 'Loading…' : 'Pick a repository the App can reach'}
				searchable
				nothingFoundMessage="Nothing left to add — grant the App more repositories on GitHub"
				data={options}
				value={selected}
				onChange={setSelected}
			/>
			<Button
				loading={add.isPending}
				disabled={selected === null}
				onClick={() => {
					if (selected !== null) {
						add.mutate(Number(selected), {
							onSuccess: () => {
								setSelected(null)
							}
						})
					}
				}}
			>
				Add
			</Button>
		</Group>
	)
}
