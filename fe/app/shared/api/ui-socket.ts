import { apiWsUrl } from './ws-url'
import { fetchUiTicket } from './ui-ticket'

const MAX_RECONNECT_DELAY_MS = 15_000

interface Subscriber {
	onMessage: (message: unknown) => void
	onOpen?: () => void
}

// One connection for the whole app, shared by every slice that cares about a
// push. Each subscriber parses what it recognises and ignores the rest, so no
// slice has to know the others' message shapes — and a second socket per feature
// would mean a second ticket, a second reconnect loop and a second backlog.
const subscribers = new Set<Subscriber>()

let socket: WebSocket | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let connecting = false
let attempt = 0

function scheduleReconnect (): void {
	if (subscribers.size === 0 || timer !== null) {
		return
	}

	timer = setTimeout(() => {
		timer = null
		connect()
	}, Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS))
	attempt += 1
}

// A ticket is single-use and lives for seconds, so every attempt — the first and
// every reconnect — has to buy a fresh one over HTTPS before dialling.
async function open (): Promise<void> {
	const ticket = await fetchUiTicket()

	// The last subscriber may have gone while the ticket was in flight. Opening
	// now would leave a socket nobody holds a handle to and nobody will close.
	if (subscribers.size === 0) {
		return
	}

	const next = new WebSocket(apiWsUrl(`/ui/ws?ticket=${encodeURIComponent(ticket)}`))

	socket = next

	next.onopen = () => {
		attempt = 0

		for (const subscriber of subscribers) {
			subscriber.onOpen?.()
		}
	}

	next.onmessage = (event: MessageEvent<string>) => {
		let message: unknown

		try {
			message = JSON.parse(event.data)
		} catch {
			return
		}

		for (const subscriber of subscribers) {
			subscriber.onMessage(message)
		}
	}

	next.onclose = () => {
		if (socket === next) {
			socket = null
		}

		scheduleReconnect()
	}
}

// A refused socket, a dropped socket and a failed ticket request are the same
// event as far as recovery goes; giving them separate handlers is how one of
// them ends up silently not retrying.
function connect (): void {
	if (connecting) {
		return
	}

	connecting = true
	open()
		.catch(scheduleReconnect)
		.finally(() => {
			connecting = false
		})
}

export function subscribeToUiSocket (subscriber: Subscriber): () => void {
	subscribers.add(subscriber)

	if (socket === null && timer === null && !connecting) {
		connect()
	} else if (socket?.readyState === WebSocket.OPEN) {
		subscriber.onOpen?.()
	}

	return () => {
		subscribers.delete(subscriber)

		if (subscribers.size > 0) {
			return
		}

		if (timer !== null) {
			clearTimeout(timer)
			timer = null
		}

		socket?.close()
		socket = null
	}
}

export function sendUiCommand (command: unknown): void {
	if (socket?.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify(command))
	}
}
