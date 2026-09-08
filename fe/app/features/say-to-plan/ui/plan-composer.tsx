import { ActionIcon, Group, Textarea } from '@mantine/core'
import { SendHorizontal } from 'lucide-react'
import { useState } from 'react'

import { useSayToPlan } from '~/features/say-to-plan/api/use-say-to-plan'

export function PlanComposer ({ planId }: { planId: string }) {
	const [text, setText] = useState('')
	const say = useSayToPlan(planId)

	const send = () => {
		const trimmed = text.trim()

		if (trimmed === '' || say.isPending) {
			return
		}

		say.mutate(trimmed, {
			onSuccess: () => {
				setText('')
			}
		})
	}

	return (
		<Group gap="xs" align="end" wrap="nowrap">
			<Textarea
				className="grow"
				placeholder="Ask for a change, answer in your own words, or add what you forgot"
				autosize
				minRows={1}
				maxRows={6}
				value={text}
				onChange={(event) => {
					setText(event.currentTarget.value)
				}}
				onKeyDown={(event) => {
					// Enter sends, shift+enter breaks the line: the box is a chat input
					// first and a text editor second.
					if (event.key === 'Enter' && !event.shiftKey) {
						event.preventDefault()
						send()
					}
				}}
			/>

			<ActionIcon
				size="lg"
				aria-label="Send"
				loading={say.isPending}
				disabled={text.trim() === ''}
				onClick={send}
			>
				<SendHorizontal size={16} />
			</ActionIcon>
		</Group>
	)
}
