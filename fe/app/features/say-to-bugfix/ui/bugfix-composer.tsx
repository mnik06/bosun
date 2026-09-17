import { useSayToBugfix } from '~/features/say-to-bugfix/api/use-say-to-bugfix'
import { ChatComposer } from '~/shared/ui'

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
	const say = useSayToBugfix(planId)
	const disabled = blockedReason !== null
	const hint =
		blockedReason ??
		(busy
			? 'The orchestrator is working — what you send waits and is picked up the moment its current round finishes.'
			: null)

	return (
		<ChatComposer
			placeholder="Paste the bugs you found, or add another message"
			disabled={disabled}
			sending={say.isPending}
			hint={hint}
			onSend={async (text) => say.mutateAsync(text)}
		/>
	)
}
