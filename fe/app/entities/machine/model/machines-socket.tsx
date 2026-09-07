import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { machineKeys } from '~/entities/machine/api/machine.queries'
import type { Machine } from '~/entities/machine/model/machine'
import { UiMsgSchema } from '~/entities/machine/model/ui-message'
import { subscribeToUiSocket } from '~/shared/api'

export interface PongResult {
	rttMs: number
	at: number
}

const PongContext = createContext<Record<string, PongResult>>({})

export function useLastPong (machineId: string): PongResult | null {
	return useContext(PongContext)[machineId] ?? null
}

function dropMachine (queryClient: QueryClient, machineId: string): void {
	queryClient.removeQueries({ queryKey: machineKeys.detail(machineId) })
	queryClient.setQueryData<Machine[]>(machineKeys.list(), (previous) =>
		previous?.filter((entry) => entry.id !== machineId)
	)
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
		return subscribeToUiSocket({
			onMessage: (raw) => {
				const parsed = UiMsgSchema.safeParse(raw)

				if (!parsed.success) {
					return
				}

				if (parsed.data.type === 'machine.updated') {
					patchMachine(queryClient, parsed.data.machine)

					return
				}

				if (parsed.data.type === 'machine.deleted') {
					dropMachine(queryClient, parsed.data.machineId)

					return
				}

				const { machineId, rttMs } = parsed.data

				setPongs((previous) => ({ ...previous, [machineId]: { rttMs, at: Date.now() } }))
			}
		})
	}, [queryClient])

	return <PongContext.Provider value={pongs}>{children}</PongContext.Provider>
}
