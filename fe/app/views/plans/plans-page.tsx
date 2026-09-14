import { Button, Group, SegmentedControl } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { MessagesSquare, Plus } from 'lucide-react'
import { useState } from 'react'

import { NewPlanModal } from '~/features/create-plan'
import { Page } from '~/shared/ui'
import { LineChatDrawer } from '~/widgets/line-chat-drawer'
import { PlanBoard } from '~/widgets/plan-board'
import { PlanHistory } from '~/widgets/plan-history'

export default function PlansPage () {
	const [creating, { open: openCreate, close: closeCreate }] = useDisclosure(false)
	const [chatting, { open: openChat, close: closeChat }] = useDisclosure(false)
	const [view, setView] = useState<'board' | 'history'>('board')

	return (
		<Page
			title="Plans"
			size="xl"
			actions={
				<Group gap="xs">
					<SegmentedControl
						size="xs"
						value={view}
						data={[
							{ value: 'board', label: 'Board' },
							{ value: 'history', label: 'History' }
						]}
						onChange={(value) => {
							setView(value === 'history' ? 'history' : 'board')
						}}
					/>
					<Button variant="subtle" size="xs" leftSection={<MessagesSquare size={14} />} onClick={openChat}>
						Ask about the line
					</Button>
					<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={openCreate}>
						New plan
					</Button>
				</Group>
			}
		>
			{view === 'board' ? <PlanBoard /> : <PlanHistory />}

			<NewPlanModal opened={creating} onClose={closeCreate} />
			<LineChatDrawer opened={chatting} onClose={closeChat} />
		</Page>
	)
}
