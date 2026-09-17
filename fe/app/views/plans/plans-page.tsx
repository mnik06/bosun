import { Button, Group, SegmentedControl } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { MessagesSquare, Plus, Wrench } from 'lucide-react'
import { useState } from 'react'

import { NewPlanModal } from '~/features/create-plan'
import { QuickFixModal } from '~/features/quick-fix'
import { Page } from '~/shared/ui'
import { LineChatDrawer } from '~/widgets/line-chat-drawer'
import { PlanBoard } from '~/widgets/plan-board'
import { PlanHistory } from '~/widgets/plan-history'
import { PlanList } from '~/widgets/plan-list'

type PlansView = 'board' | 'list' | 'history'

export default function PlansPage () {
	const [creating, { open: openCreate, close: closeCreate }] = useDisclosure(false)
	const [fixing, { open: openFix, close: closeFix }] = useDisclosure(false)
	const [chatting, { open: openChat, close: closeChat }] = useDisclosure(false)
	const [view, setView] = useState<PlansView>('board')

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
							{ value: 'list', label: 'List' },
							{ value: 'history', label: 'History' }
						]}
						onChange={(value) => {
							setView(value === 'list' || value === 'history' ? value : 'board')
						}}
					/>
					<Button variant="subtle" size="xs" leftSection={<MessagesSquare size={14} />} onClick={openChat}>
						Ask about the line
					</Button>
					<Button variant="subtle" size="xs" leftSection={<Wrench size={14} />} onClick={openFix}>
						Quick fix
					</Button>
					<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={openCreate}>
						New plan
					</Button>
				</Group>
			}
		>
			{view === 'board' ? <PlanBoard /> : null}
			{view === 'list' ? <PlanList /> : null}
			{view === 'history' ? <PlanHistory /> : null}

			<NewPlanModal opened={creating} onClose={closeCreate} />
			<QuickFixModal opened={fixing} onClose={closeFix} />
			<LineChatDrawer opened={chatting} onClose={closeChat} />
		</Page>
	)
}
