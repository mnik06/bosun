import type { Machine } from '~/entities/machine'
import type { MachineCapacity } from '~/entities/plan/model/line'

// Named the same three ways the backend refuses a new session's admission
// (`requireHost`/`admitBugfixSession`): offline, never finished enrolling, or
// already full. The precise capacity math lives server-side against a live
// repository snapshot — this reads the same numbers the board's capacity strip
// already shows, close enough to warn before the click, not to replace the
// backend's own refusal on send.
export function bugfixBlockReason (opts: {
	machine: Pick<Machine, 'status'> | null
	capacity: MachineCapacity | undefined
}): string | null {
	const { machine, capacity } = opts

	if (machine === null) {
		return 'No machine is assigned to this build.'
	}

	if (machine.status === 'pending') {
		return 'This machine has not finished enrolling.'
	}

	if (machine.status === 'offline' || capacity?.online === false) {
		return 'This machine is offline.'
	}

	if (machine.status === 'paused') {
		return 'This machine is paused.'
	}

	if (capacity !== undefined && capacity.buildCap !== null && capacity.buildsRunning >= capacity.buildCap) {
		return 'This machine has no room to run a bug-fixing session right now.'
	}

	return null
}
