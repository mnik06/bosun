import { type MachineMemory } from 'src/types/machine-memory';

// What each machine last said about its memory, held in the process rather than
// on the row. The scheduler is its only reader, and every connection re-announces
// it on `hello` — including the reconnect every agent makes after a deploy, which
// is the only time this map starts out empty.
export function getMachineMemoryService() {
	const reported = new Map<string, MachineMemory>();

	return {
		// Absent is recorded as absent. An agent too old to report memory has to fall
		// back to the fixed cap, not to what a newer build said before a downgrade.
		set(machineId: string, memory: MachineMemory | undefined): void {
			if (memory === undefined) {
				reported.delete(machineId);

				return;
			}

			reported.set(machineId, memory);
		},

		get(machineId: string): MachineMemory | null {
			return reported.get(machineId) ?? null;
		}
	};
}

export type MachineMemoryService = ReturnType<typeof getMachineMemoryService>;
