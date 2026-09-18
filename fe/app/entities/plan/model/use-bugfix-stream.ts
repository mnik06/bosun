import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { bugfixKeys } from '~/entities/plan/api/bugfix.queries'
import { appendBugfixMessage } from '~/entities/plan/lib/plan-cache'
import { BugfixUiMsgSchema, type BugfixUiMsg } from '~/entities/plan/model/bugfix-message'
import { sendUiCommand, subscribeToUiSocket } from '~/shared/api'

export interface BugfixStream {
	streamingText: string
	activity: string | null
}

interface StreamState extends BugfixStream {
	buildId: string | null
}

const EMPTY = { streamingText: '', activity: null }

function applyFrame (opts: {
	frame: BugfixUiMsg
	planId: string
	queryClient: ReturnType<typeof useQueryClient>
	previous: StreamState
}): StreamState {
	const { frame, previous } = opts

	if (frame.type === 'bugfix.text') {
		return { ...previous, streamingText: previous.streamingText + frame.delta }
	}

	if (frame.type === 'bugfix.activity') {
		return { ...previous, activity: frame.label }
	}

	if (frame.type === 'bugfix.message') {
		appendBugfixMessage({ queryClient: opts.queryClient, planId: opts.planId, message: frame.message })

		// The buffer and the stored message are the same prose, on the same terms
		// as `use-plan-stream.ts`: clearing it here is what keeps the text from
		// appearing twice for the instant between the two frames.
		return frame.message.role === 'user' ? previous : { ...previous, streamingText: '' }
	}

	if (frame.type === 'bugfix.bugs') {
		return previous
	}

	// Only `bugfix.done`/`bugfix.error` remain.
	return { ...previous, activity: null }
}

// A sibling of `use-plan-stream.ts` for the build's bug-fixing session. It reads
// the same shared socket and the same `plan.subscribe` channel that plan
// (chat) already opens for the page — see `plan-page.tsx`, which mounts this
// alongside `usePlanStream` for as long as the plan page itself is mounted, not
// only while the Bug Fixing tab is active. That is deliberate: unsubscribing
// here on every tab switch would send `plan.unsubscribe` for a plan the chat
// stream still needs, since the command unsubscribes the whole socket from the
// plan, not just this hook's interest in it. Only `usePlanStream`'s own
// unmount — the page itself closing — sends that.
export function useBugfixStream (opts: { planId: string, buildId: string | null }): BugfixStream {
	const { planId, buildId } = opts
	const queryClient = useQueryClient()
	const [state, setState] = useState<StreamState>({ buildId, ...EMPTY })

	// Adjusted during render, on the same terms as `use-plan-stream.ts`: a build
	// starting a fresh bug-fixing session reuses this component, and clearing the
	// buffer in an effect would paint the previous session's tail under the new
	// one for a frame.
	if (state.buildId !== buildId) {
		setState({ buildId, ...EMPTY })
	}

	const opened = useRef(false)

	useEffect(() => {
		opened.current = false

		if (buildId === null) {
			return
		}

		const unsubscribe = subscribeToUiSocket({
			// Re-sent on every open, on the same terms as `use-plan-stream.ts`: the
			// subscription lives in the server's socket registry, so a reconnect
			// starts with no memory of what this tab watches, and any `bugfix.message`
			// frame sent during the gap is gone rather than queued.
			onOpen: () => {
				sendUiCommand({ type: 'plan.subscribe', planId })

				if (opened.current || queryClient.getQueryData(bugfixKeys.messages(planId)) !== undefined) {
					void queryClient.invalidateQueries({ queryKey: bugfixKeys.messages(planId) })
					void queryClient.invalidateQueries({ queryKey: bugfixKeys.bugs(planId) })
				}

				opened.current = true
			},
			onMessage: (raw) => {
				const parsed = BugfixUiMsgSchema.safeParse(raw)

				if (!parsed.success || parsed.data.buildId !== buildId) {
					return
				}

				setState((previous) =>
					previous.buildId === buildId
						? applyFrame({ frame: parsed.data, planId, queryClient, previous })
						: previous
				)
			}
		})

		return unsubscribe
	}, [planId, buildId, queryClient])

	return { streamingText: state.streamingText, activity: state.activity }
}
