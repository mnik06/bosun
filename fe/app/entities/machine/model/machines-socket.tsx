import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { machineKeys } from '~/entities/machine/api/machine.queries'
import type { Machine } from '~/entities/machine/model/machine'
import { UiMsgSchema } from '~/entities/machine/model/ui-message'
import { apiWsUrl } from '~/shared/api'

const MAX_RECONNECT_DELAY_MS = 15_000

export interface PongResult {
	rttMs: number
	at: number
}

const PongContext = createContext<Record<string, PongResult>>({})

export function useLastPong (machineId: string): PongResult | null {
	return useContext(PongContext)[machineId] ?? null
}

function patchMachine (queryClient: QueryClient, machine: Machine): void {
	queryClient.setQueryData(machineKeys.detail(machine.id), machine)
	queryClient.setQueryData<Machine[]>(machineKeys.list(), (previous) =>
		previous?.map((entry) => (entry.id === machine.id ? machine : entry))
	)
}

export function MachinesSocketProvider ({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient()
	const [pongs, setPongs] = useState<Record<string, PongResult>>({})

	useEffect(() => {
		let socket: WebSocket | null = null
		let timer: ReturnType<typeof setTimeout> | null = null
		let attempt = 0
		let disposed = false

		const handle = (raw: unknown) => {
			const parsed = UiMsgSchema.safeParse(raw)

			if (!parsed.success) {
				return
			}

			if (parsed.data.type === 'machine.updated') {
				patchMachine(queryClient, parsed.data.machine)

				return
			}

			const { machineId, rttMs } = parsed.data

			setPongs((previous) => ({ ...previous, [machineId]: { rttMs, at: Date.now() } }))
		}

		const connect = () => {
			socket = new WebSocket(apiWsUrl('/ui/ws'))

			socket.onopen = () => {
				attempt = 0
			}

			socket.onmessage = (event: MessageEvent<string>) => {
				try {
					handle(JSON.parse(event.data))
				} catch {
					// A frame the server should never have sent; dropping it is the whole response.
				}
			}

			socket.onclose = () => {
				if (disposed) {
					return
				}

				timer = setTimeout(connect, Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS))
				attempt += 1
			}
		}

		connect()

		return () => {
			disposed = true

			if (timer) {
				clearTimeout(timer)
			}

			socket?.close()
		}
	}, [queryClient])

	return <PongContext.Provider value={pongs}>{children}</PongContext.Provider>
}
