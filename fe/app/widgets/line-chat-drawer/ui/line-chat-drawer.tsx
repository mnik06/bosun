import { Drawer, Select, Stack, Text } from '@mantine/core'
import { useState } from 'react'

import { useRepositoriesQuery } from '~/entities/repository'
import { LineChat } from '~/features/ask-line'

export function LineChatDrawer ({ opened, onClose }: { opened: boolean, onClose: () => void }) {
	const repositories = useRepositoriesQuery()
	const list = repositories.data ?? []
	const [picked, setPicked] = useState<string | null>(null)
	const repositoryId = picked ?? list[0]?.id ?? null

	return (
		<Drawer opened={opened} onClose={onClose} position="right" size="md" title="Ask about the line">
			<Stack gap="md" className="h-[calc(100dvh-6rem)]">
				{list.length > 1 ? (
					<Select
						label="Repository"
						data={list.map((repository) => ({ value: repository.id, label: repository.fullName }))}
						value={repositoryId}
						allowDeselect={false}
						onChange={setPicked}
					/>
				) : null}

				{repositoryId === null ? (
					<Text size="sm" c="dimmed">
						No repository is attached to a machine in this project yet.
					</Text>
				) : (
					<LineChat key={repositoryId} repositoryId={repositoryId} />
				)}
			</Stack>
		</Drawer>
	)
}
