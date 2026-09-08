import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { machineKeys } from '~/entities/machine/api/machine.queries'
import type { Machine } from '~/entities/machine/model/machine'
import {
	UiMsgSchema,
	type RunQuestionMsg,
	type UiMsg
} from '~/entities/machine/model/ui-message'
import { queueKeys, type Queue, type QueueDetail } from '~/entities/queue'
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
const AnswerContext = createContext<Record<string, string>>({})
const RunContext = createContext<{
	activity: Record<string, string>,
	questions: Record<string, RunQuestionMsg>
}>({ activity: {}, questions: {} })

export function useLastPong (machineId: string): PongResult | null {
	return useContext(PongContext)[machineId] ?? null
}

export function useUpgradingTo (machineId: string): string | null {
	return useContext(UpgradeContext)[machineId] ?? null
}

// The streamed half of an answer, keyed by queue. Dropped once the finished
// message arrives over `queue.message`, which is the one that gets stored.
export function useQueueAnswer (queueId: string): string | null {
	return useContext(AnswerContext)[queueId] ?? null
}

export function useRunActivity (): Record<string, string> {
	return useContext(RunContext).activity
}

export function useRunQuestion (runId: string | null): RunQuestionMsg | null {
	const { questions } = useContext(RunContext)

	return runId === null ? null : questions[runId] ?? null
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

function withQueue (previous: Queue[], queue: Queue): Queue[] {
	return previous.some((entry) => entry.id === queue.id)
		? previous.map((entry) => (entry.id === queue.id ? queue : entry))
		: [queue, ...previous]
}

// Every cache a queue is read from, not the machine's list alone: the queues page
// reads `list()` and the queue page reads `detail()`, and a status change missing
// from either of those looks like the button did nothing until a refresh.
function patchQueue (queryClient: QueryClient, queue: Queue): void {
	queryClient.setQueryData<Queue[]>(queueKeys.forMachine(queue.machineId), (previous) =>
		previous === undefined ? previous : withQueue(previous, queue)
	)
	queryClient.setQueryData<Queue[]>(queueKeys.list(), (previous) =>
		previous === undefined ? previous : withQueue(previous, queue)
	)
	queryClient.setQueryData<QueueDetail>(queueKeys.detail(queue.id), (previous) =>
		previous === undefined ? previous : { ...previous, queue }
	)
}

// The machine a deleted queue belonged to is not in the frame, so every cached
// machine list is swept rather than the one it came from.
function dropQueue (queryClient: QueryClient, queueId: string): void {
	queryClient.setQueriesData<Queue[]>({ queryKey: queueKeys.all }, (previous) =>
		previous?.filter((entry) => entry.id !== queueId)
	)
}

export function MachinesSocketProvider ({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient()
	const [pongs, setPongs] = useState<Record<string, PongResult>>({})
	const [upgrades, setUpgrades] = useState<Record<string, string>>({})
	const [runActivity, setRunActivity] = useState<Record<string, string>>({})
	const [runQuestions, setRunQuestions] = useState<Record<string, RunQuestionMsg>>({})
	const [answers, setAnswers] = useState<Record<string, string>>({})
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

			if (msg.type === 'queue.answer') {
				setAnswers((previous) => ({
					...previous,
					[msg.queueId]: `${previous[msg.queueId] ?? ''}${msg.delta}`
				}))

				return
			}

			if (msg.type === 'queue.message') {
				setAnswers((previous) => without(previous, msg.message.queueId))
				queryClient
					.invalidateQueries({ queryKey: queueKeys.detail(msg.message.queueId) })
					.catch(() => {
						// A refetch that fails leaves the panel as it was; the next one recovers.
					})

				return
			}

			if (msg.type === 'plan.decision') {
				queryClient.invalidateQueries({ queryKey: ['plans', 'detail', msg.planId] }).catch(() => {
					// A refetch that fails leaves the page as it was; the next one recovers.
				})

				return
			}

			if (msg.type === 'run.activity') {
				setRunActivity((previous) => ({ ...previous, [msg.runId]: msg.label }))

				return
			}

			// The transcript is not kept in the browser: a queue can run for hours and
			// the answer to "what is it doing" is the activity line, not every token.
			if (msg.type === 'run.text') {
				return
			}

			if (msg.type === 'run.question') {
				setRunQuestions((previous) => ({ ...previous, [msg.runId]: msg }))

				return
			}

			if (msg.type === 'queue.updated') {
				patchQueue(queryClient, msg.queue)

				return
			}

			if (msg.type === 'queue.deleted') {
				dropQueue(queryClient, msg.queueId)

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
			<UpgradeContext.Provider value={upgrades}>
				<RunContext.Provider value={{ activity: runActivity, questions: runQuestions }}>
					<AnswerContext.Provider value={answers}>{children}</AnswerContext.Provider>
				</RunContext.Provider>
			</UpgradeContext.Provider>
		</PongContext.Provider>
	)
}
