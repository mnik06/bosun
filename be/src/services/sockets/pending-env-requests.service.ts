import { type EnvSetSummary } from 'src/types/env-sets';

export type EnvReply = { ok: true; envSets: EnvSetSummary[] } | { ok: false; message: string };

type Pending = {
	machineId: string;
	timer: NodeJS.Timeout;
	resolve: (reply: EnvReply | null) => void;
};

// An env change is an HTTP request answered on the agent's socket, so the request
// waits here for the frame that settles it. Resolves null rather than rejecting
// on timeout: a wait that is abandoned — the frame could not be sent — is never
// awaited, and a rejection nobody holds takes the process down.
export function getPendingEnvRequestsService() {
	const pending = new Map<string, Pending>();

	function finish(requestId: string, reply: EnvReply | null): void {
		const entry = pending.get(requestId);

		if (!entry) {
			return;
		}

		pending.delete(requestId);
		clearTimeout(entry.timer);
		entry.resolve(reply);
	}

	return {
		wait(opts: {
			requestId: string;
			machineId: string;
			timeoutMs: number;
		}): Promise<EnvReply | null> {
			return new Promise((resolve) => {
				const timer = setTimeout(() => finish(opts.requestId, null), opts.timeoutMs);

				pending.set(opts.requestId, { machineId: opts.machineId, timer, resolve });
			});
		},

		settle(opts: { requestId: string; machineId: string; result: EnvReply }): boolean {
			const entry = pending.get(opts.requestId);

			// A reply quoting another machine's request id is a bug or a forgery, and
			// accepting it would write one machine's key list onto another's row.
			if (!entry || entry.machineId !== opts.machineId) {
				return false;
			}

			finish(opts.requestId, opts.result);

			return true;
		},

		cancel(requestId: string): void {
			finish(requestId, null);
		}
	};
}

export type PendingEnvRequestsService = ReturnType<typeof getPendingEnvRequestsService>;
