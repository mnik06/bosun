import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { machineKeys } from '~/entities/machine/api/machine.queries'
import type { Machine } from '~/entities/machine/model/machine'
import { UiMsgSchema, type UiMsg } from '~/entities/machine/model/ui-message'
import { subscribeToUiSocket } from '~/shared/api'

export interface PongResult {
	rttMs: number
	at: number
}

// A failed upgrade reports nothing back — the agent logs it and stays on the
// build it has — so the banner needs an end of its own or it would outlive the
// attempt it describes.
const UPGRADE_TIMEOUT_MS = 180_000

const PongContext = createContext<Record<string, PongResult>>({})
const UpgradeContext = createContext<Record<string, string>>({})

export function useLastPong (machineId: string): PongResult | null {
	return useContext(PongContext)[machineId] ?? null
}

export function useUpgradingTo (machineId: string): string | null {
	return useContext(UpgradeContext)[machineId] ?? null
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

function without (previous: Record<string, string>, machineId: string): Record<string, string> {
	const { [machineId]: _removed, ...rest } = previous

	return rest
}

export function MachinesSocketProvider ({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient()
	const [pongs, setPongs] = useState<Record<string, PongResult>>({})
	const [upgrades, setUpgrades] = useState<Record<string, string>>({})
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
	// Read through a ref so the subscription is not a function of the state it
	// maintains: depending on `upgrades` would tear down and re-open the socket
	// every time an upgrade starts or ends.
	const latest = useRef(upgrades)

	useEffect(() => {
		latest.current = upgrades
	}, [upgrades])

	useEffect(() => {
		const pending = timers.current

		const forget = (machineId: string) => {
			clearTimeout(pending.get(machineId))
			pending.delete(machineId)
			setUpgrades((previous) => without(previous, machineId))
		}

		const handle = (msg: UiMsg) => {
			if (msg.type === 'machine.upgrading') {
				clearTimeout(pending.get(msg.machineId))
				pending.set(msg.machineId, setTimeout(() => { forget(msg.machineId) }, UPGRADE_TIMEOUT_MS))
				setUpgrades((previous) => ({ ...previous, [msg.machineId]: msg.to }))

				return
			}

			if (msg.type === 'machine.updated') {
				patchMachine(queryClient, msg.machine)

				// Only the version arriving is proof the swap took. Any other update
				// is the agent answering the same refresh that triggered the upgrade.
				if (latest.current[msg.machine.id] === msg.machine.agentVersion) {
					forget(msg.machine.id)
				}

				return
			}

			if (msg.type === 'machine.deleted') {
				dropMachine(queryClient, msg.machineId)
				forget(msg.machineId)

				return
			}

			setPongs((previous) => ({
				...previous,
				[msg.machineId]: { rttMs: msg.rttMs, at: Date.now() }
			}))
		}

		const unsubscribe = subscribeToUiSocket({
			onMessage: (raw) => {
				const parsed = UiMsgSchema.safeParse(raw)

				if (parsed.success) {
					handle(parsed.data)
				}
			}
		})

		return () => {
			unsubscribe()

			for (const timer of pending.values()) {
				clearTimeout(timer)
			}

			pending.clear()
		}
	}, [queryClient])

	return (
		<PongContext.Provider value={pongs}>
			<UpgradeContext.Provider value={upgrades}>{children}</UpgradeContext.Provider>
		</PongContext.Provider>
	)
}
