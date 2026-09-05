const pending = new Map<string, { machineId: string; sentAt: number }>();

export function recordPing(opts: { commandId: string; machineId: string; sentAt: number }): void {
	pending.set(opts.commandId, { machineId: opts.machineId, sentAt: opts.sentAt });
}

export function resolvePing(opts: {
	commandId: string;
	machineId: string;
	at: number;
}): number | null {
	const entry = pending.get(opts.commandId);

	// A pong quoting another machine's command id is either a bug or a forged
	// reply; either way it must not produce a latency reading.
	if (!entry || entry.machineId !== opts.machineId) {
		return null;
	}

	pending.delete(opts.commandId);

	return opts.at - entry.sentAt;
}
