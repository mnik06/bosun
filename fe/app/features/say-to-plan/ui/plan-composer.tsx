import { CHAT_ATTACHMENT_LIMITS } from '~/entities/plan'
import { useSayToPlan } from '~/features/say-to-plan/api/use-say-to-plan'
import { ChatComposer } from '~/shared/ui'

export function PlanComposer ({
	planId,
	busy,
	onAnswer,
	answering = false
}: {
	planId: string,
	busy: boolean,
	// Given when a question is open. Typed text answers it rather than joining the
	// queue behind it: the session is blocked inside the tool call that asked, so a
	// queued line would wait for the thing that is waiting for it.
	onAnswer?: ((text: string) => Promise<unknown>) | undefined,
	answering?: boolean
}) {
	const say = useSayToPlan(planId)
	const sending = say.isPending || answering
	const hint =
		busy && !onAnswer
			? 'The session is working — what you send waits and is picked up the moment its current step finishes.'
			: null

	// An answer is the words that settle an open question, and the tool call
	// waiting on it takes nothing else — files go with a message of their own.
	const attachments = onAnswer ? undefined : CHAT_ATTACHMENT_LIMITS

	return (
		<ChatComposer
			placeholder={onAnswer ? 'Answer in your own words' : 'Ask for a change, or add what you forgot'}
			sending={sending}
			hint={hint}
			attachments={attachments}
			attachmentsOff={onAnswer ? 'Answer the open question first — files can go in the message after it.' : null}
			onSend={async (message) => (onAnswer ? onAnswer(message.text) : say.mutateAsync(message))}
		/>
	)
}
