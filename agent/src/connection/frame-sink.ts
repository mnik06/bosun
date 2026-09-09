import { type AgentMsg } from '../protocol';

// The frames whose loss changes what the backend believes. Everything else is
// the live view of a bullet that is still running — text deltas and activity
// labels — and replaying twenty minutes of those on reconnect would redraw a
// transcript the browser already has, on top of growing without bound for as
// long as the connection is down.
const SETTLING = new Set(['exec.done', 'exec.error', 'exec.question']);

export interface FrameSink {
	attach(deliver: (message: AgentMsg) => void): void;
	detach(): void;
	send(message: AgentMsg): void;
	pendingRunIds(): string[];
}

// An execution session outlives the socket it was dispatched over: `claude` keeps
// building through a backend deploy, and the frame saying how the bullet went has
// to survive the gap rather than be written into a pipe nobody is reading. So the
// sink holds a slot for whatever connection is current instead of holding a
// connection, and the sessions send through it without knowing which one that is.
export function createFrameSink(): FrameSink {
	let deliver: ((message: AgentMsg) => void) | null = null;
	const pending: AgentMsg[] = [];

	return {
		// Attached on `open` rather than at construction, so a slot that is filled
		// always means a socket that can actually carry a frame — which is what lets
		// `send` treat "no slot" as "buffer it" without asking about ready state.
		attach(next: (message: AgentMsg) => void): void {
			deliver = next;

			// Drained rather than iterated: a frame that throws on the way out must not
			// stay queued to be sent a second time on the connection after this one.
			for (const message of pending.splice(0)) {
				next(message);
			}
		},

		detach(): void {
			deliver = null;
		},

		send(message: AgentMsg): void {
			if (deliver) {
				deliver(message);

				return;
			}

			if (SETTLING.has(message.type)) {
				pending.push(message);

				return;
			}

			console.error(`dropped ${message.type}: the connection is not open`);
		},

		// Reported on `hello` alongside the live sessions. A bullet that finished
		// while the connection was down has no session left to hold it, but its
		// result is parked right here — and a backend that settled it as stranded
		// would pause the queue over a plan that in fact landed, and hand the same
		// bullet out again on resume.
		pendingRunIds(): string[] {
			return pending.flatMap((message) => ('runId' in message ? [message.runId] : []));
		}
	};
}
