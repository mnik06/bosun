import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { planKeys } from '~/entities/plan/api/plan.queries'
import { appendPlanMessage, patchPlanArtifact } from '~/entities/plan/lib/plan-cache'
import { PlanUiMsgSchema, type PlanUiMsg } from '~/entities/plan/model/plan-message'
import { sendUiCommand, subscribeToUiSocket } from '~/shared/api'

export interface PlanStream {
	streamingText: string
	activity: string | null
}

interface StreamState extends PlanStream {
	planId: string
}

const EMPTY = { streamingText: '', activity: null }

function applyFrame (opts: {
	frame: PlanUiMsg
	planId: string
	queryClient: ReturnType<typeof useQueryClient>
	previous: StreamState
}): StreamState {
	const { frame, previous } = opts

	if (frame.type === 'plan.text') {
		return { ...previous, streamingText: previous.streamingText + frame.delta }
	}

	if (frame.type === 'plan.activity') {
		return { ...previous, activity: frame.label }
	}

	if (frame.type === 'plan.message') {
		appendPlanMessage({ queryClient: opts.queryClient, planId: opts.planId, message: frame.message })

		// The buffer and the stored message are the same prose. Clearing it here,
		// on the message that replaces it, is what keeps the text from appearing
		// twice for the instant between the two frames.
		if (frame.message.role === 'assistant') {
			return { ...previous, streamingText: '' }
		}

		return frame.message.role === 'question' ? { ...previous, activity: null } : previous
	}

	if (frame.type === 'plan.artifact') {
		patchPlanArtifact({
			queryClient: opts.queryClient,
			planId: opts.planId,
			acs: frame.acs,
			slices: frame.slices
		})

		return previous
	}

	return frame.type === 'plan.done' || frame.type === 'plan.error'
		? { ...previous, activity: null }
		: previous
}

export function usePlanStream (planId: string): PlanStream {
	const queryClient = useQueryClient()
	const [state, setState] = useState<StreamState>({ planId, ...EMPTY })
	const opened = useRef(false)

	// Adjusted during render rather than in an effect: navigating between two
	// plans reuses this component, and clearing the buffer in an effect would
	// paint one plan's stream under the other's transcript for a frame.
	if (state.planId !== planId) {
		setState({ planId, ...EMPTY })
	}

	useEffect(() => {
		opened.current = false

		const unsubscribe = subscribeToUiSocket({
			// Re-sent on every open: the subscription lives in the server's socket
			// registry, so a reconnect starts with no memory of what this tab watches.
			onOpen: () => {
				sendUiCommand({ type: 'plan.subscribe', planId })

				// Frames sent while the socket was down are gone — they are pushes, not a
				// queue — so a reconnect refetches the transcript rather than resuming a
				// chat with a hole in it. Skipped on the first open, where the query is
				// already loading.
				if (opened.current) {
					void queryClient.invalidateQueries({ queryKey: planKeys.detail(planId) })
				}

				opened.current = true
			},
			onMessage: (raw) => {
				const parsed = PlanUiMsgSchema.safeParse(raw)

				if (!parsed.success || !('planId' in parsed.data) || parsed.data.planId !== planId) {
					return
				}

				setState((previous) =>
					previous.planId === planId
						? applyFrame({ frame: parsed.data, planId, queryClient, previous })
						: previous
				)
			}
		})

		return () => {
			sendUiCommand({ type: 'plan.unsubscribe', planId })
			unsubscribe()
		}
	}, [planId, queryClient])

	return { streamingText: state.streamingText, activity: state.activity }
}
