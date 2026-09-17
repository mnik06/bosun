import { ActionIcon, Group, Stack, Text, Textarea } from '@mantine/core'
import { SendHorizontal } from 'lucide-react'
import { useState } from 'react'

import { useSayToBugfix } from '~/features/say-to-bugfix/api/use-say-to-bugfix'
import { submitOnEnter } from '~/shared/lib'

export function BugfixComposer ({
	planId,
	blockedReason,
	busy
}: {
	planId: string
	// Set once the machine cannot run a session right now — offline, still
	// enrolling, paused, or out of room. Distinct from `busy`: a busy session is
	// still reachable, a blocked one is not worth trying to reach.
	blockedReason: string | null
	busy: boolean
}) {
	const [text, setText] = useState('')
	const say = useSayToBugfix(planId)
	const disabled = blockedReason !== null
	const hint =
		blockedReason ??
		(busy
			? 'The orchestrator is working — what you send waits and is picked up the moment its current round finishes.'
			: null)

	const send = () => {
		const trimmed = text.trim()

		if (trimmed === '' || say.isPending || disabled) {
			return
		}

		say.mutate(trimmed, {
			onSuccess: () => {
				setText('')
			}
		})
	}

	return (
		<Stack gap={4}>
			<Group gap="xs" align="end" wrap="nowrap">
				<Textarea
					className="grow"
					placeholder="Paste the bugs you found, or add another message"
					autosize
					minRows={1}
					maxRows={6}
					disabled={disabled}
					value={text}
					onChange={(event) => {
						setText(event.currentTarget.value)
					}}
					onKeyDown={submitOnEnter(send)}
				/>

				<ActionIcon
					size="lg"
					aria-label="Send"
					loading={say.isPending}
					disabled={disabled || text.trim() === ''}
					onClick={send}
				>
					<SendHorizontal size={16} />
				</ActionIcon>
			</Group>

			{hint === null ? null : (
				<Text size="xs" c="dimmed">
					{hint}
				</Text>
			)}
		</Stack>
	)
}
