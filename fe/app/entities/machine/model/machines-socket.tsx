import { notifications } from '@mantine/notifications'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { machineKeys } from '~/entities/machine/api/machine.queries'
import type { Machine } from '~/entities/machine/model/machine'
import { UiMsgSchema, type UiMsg } from '~/entities/machine/model/ui-message'
import { repositoryKeys, type Repository } from '~/entities/repository'
import { subscribeToUiSocket } from '~/shared/api'

// A failed upgrade reports nothing back — the agent logs it and stays on the
// build it has — so the banner needs an end of its own or it would outlive the
// attempt it describes.
const UPGRADE_TIMEOUT_MS = 180_000

const UpgradeContext = createContext<Record<string, string>>({})

export interface UpgradeDecline {
	to: string
	reason: string
	retryable: boolean
	// The machine is holding this version and will install it when its work ends,
	// so there is nothing for anybody to come back and press.
	queued: boolean
}

const DeclineContext = createContext<Record<string, UpgradeDecline>>({})

export function useUpgradingTo (machineId: string): string | null {
	return useContext(UpgradeContext)[machineId] ?? null
}

// Why the last upgrade offer was turned down. Survives until the next offer,
// because the answer to "why is this machine still on the old version" has to
// outlive the frame that delivered it.
export function useUpgradeDecline (machineId: string): UpgradeDecline | null {
	return useContext(DeclineContext)[machineId] ?? null
}

function dropMachine (queryClient: QueryClient, machineId: string): void {
	queryClient.removeQueries({ queryKey: machineKeys.detail(machineId) })
	queryClient.setQueryData<Machine[]>(machineKeys.list(), (previous) =>
		previous?.filter((entry) => entry.id !== machineId)
	)
}

// The onboarding report derives what is still missing from what the machine
// holds, so a machine that changed is a report that may have too.
function patchMachine (queryClient: QueryClient, machine: Machine): void {
	queryClient.setQueryData(machineKeys.detail(machine.id), machine)
	queryClient.setQueryData<Machine[]>(machineKeys.list(), (previous) =>
		previous?.map((entry) => (entry.id === machine.id ? machine : entry))
	)
	refetch(queryClient, repositoryKeys.machineOnboarding(machine.id))
}

function patchRepository (queryClient: QueryClient, repository: Repository): void {
	queryClient.setQueryData<Repository[]>(repositoryKeys.list(), (previous) =>
		previous?.some((entry) => entry.id === repository.id)
			? previous.map((entry) => (entry.id === repository.id ? repository : entry))
			: previous && [...previous, repository]
	)
}

function refetch (queryClient: QueryClient, queryKey: readonly unknown[]): void {
	queryClient.invalidateQueries({ queryKey }).catch(() => {
		// A refetch that fails leaves the panel as it was; the next one recovers.
	})
}

function without <T> (previous: Record<string, T>, machineId: string): Record<string, T> {
	const { [machineId]: _removed, ...rest } = previous

	return rest
}

type RepositoryMsg = Extract<UiMsg, { type: 'repository.updated' | 'onboarding.updated' | 'machine.repository.error' }>

const REPOSITORY_MSG_TYPES = new Set<UiMsg['type']>(['repository.updated', 'onboarding.updated', 'machine.repository.error'])

function isRepositoryMsg (msg: UiMsg): msg is RepositoryMsg {
	return REPOSITORY_MSG_TYPES.has(msg.type)
}

// Repository and onboarding frames change caches only, so they are handled apart
// from the machine frames that also drive this provider's own state.
function handleRepositoryMsg (queryClient: QueryClient, msg: RepositoryMsg): void {
	switch (msg.type) {
		case 'repository.updated':
			patchRepository(queryClient, msg.repository)
			refetch(queryClient, repositoryKeys.config(msg.repository.id))

			return
		case 'onboarding.updated':
			refetch(queryClient, repositoryKeys.onboarding())

			return
		case 'machine.repository.error':
			// The attach was a 202 long before the clone failed, so this is the only
			// place the reason can reach whoever pressed the button.
			notifications.show({ color: 'red', title: 'Could not attach the repository', message: msg.message })
			refetch(queryClient, machineKeys.detail(msg.machineId))
	}
}

export function MachinesSocketProvider ({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient()
	const [upgrades, setUpgrades] = useState<Record<string, string>>({})
	const [declines, setDeclines] = useState<Record<string, UpgradeDecline>>({})
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
			if (isRepositoryMsg(msg)) {
				handleRepositoryMsg(queryClient, msg)

				return
			}

			if (msg.type === 'machine.upgrade.declined') {
				// The offer is settled, so the banner stops claiming otherwise rather
				// than being left to expire on a timeout.
				forget(msg.machineId)
				setDeclines((previous) => ({
					...previous,
					[msg.machineId]: {
						to: msg.to,
						reason: msg.reason,
						retryable: msg.retryable,
						queued: msg.queued ?? false
					}
				}))

				return
			}

			if (msg.type === 'machine.upgrading') {
				clearTimeout(pending.get(msg.machineId))
				pending.set(msg.machineId, setTimeout(() => { forget(msg.machineId) }, UPGRADE_TIMEOUT_MS))
				setDeclines((previous) => without(previous, msg.machineId))
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

			dropMachine(queryClient, msg.machineId)
			forget(msg.machineId)
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
		<UpgradeContext.Provider value={upgrades}>
			<DeclineContext.Provider value={declines}>
				{children}
			</DeclineContext.Provider>
		</UpgradeContext.Provider>
	)
}
