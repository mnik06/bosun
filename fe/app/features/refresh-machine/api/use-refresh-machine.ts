import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// A wedged agent that accepts the frame and never reports back must not leave
// the indicator spinning for the rest of the session.
const SETTLE_TIMEOUT_MS = 20_000

export function useRefreshMachine (opts: { machineId: string, settleKey: string | null }) {
	const [flight, setFlight] = useState<{ startedAt: string | null } | null>(null)

	// The 202 only says the frame was sent. The refresh is finished when the
	// agent's new checklist arrives over the socket, which is what moves
	// settleKey — so the indicator is derived from that rather than from the
	// response, and needs no effect to clear it.
	const isRefreshing = flight !== null && flight.startedAt === opts.settleKey

	const mutation = useMutation({
		mutationFn: async () => {
			await apiClient.post(`/machines/${opts.machineId}/refresh`)
		},
		onError: (error: unknown) => {
			setFlight(null)
			notifyError({ title: 'Could not refresh checks', error })
		}
	})

	useEffect(() => {
		if (flight === null) {
			return
		}

		const timer = setTimeout(() => {
			setFlight(null)
		}, SETTLE_TIMEOUT_MS)

		return () => {
			clearTimeout(timer)
		}
	}, [flight])

	return {
		isRefreshing,
		refresh: () => {
			setFlight({ startedAt: opts.settleKey })
			mutation.mutate()
		}
	}
}
