import { Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { SlidersHorizontal } from 'lucide-react'

import type { Machine } from '~/entities/machine'
import { ProjectProfileModal } from '~/features/edit-project-profile/ui/project-profile-modal'

export function ProjectProfileButton ({ machine }: { machine: Machine }) {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<>
			<Button
				variant="light"
				size="xs"
				leftSection={<SlidersHorizontal size={14} />}
				onClick={open}
			>
				Project setup
			</Button>

			<ProjectProfileModal machine={machine} opened={opened} onClose={close} />
		</>
	)
}
