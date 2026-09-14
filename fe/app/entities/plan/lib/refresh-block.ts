import type { MachineCapacity } from '~/entities/plan/model/line'

// A refresh is also how an agent upgrade is offered, and the agent refuses to swap
// its own binary while a session is running. The refusal is right; making the
// button look available while it holds is what confused everybody.
export function machineRefreshBlock (capacity: MachineCapacity | undefined): string | null {
	if (capacity === undefined) {
		return null
	}

	const busy = capacity.buildsRunning + capacity.lane.length

	if (busy === 0) {
		return null
	}

	const what = busy === 1 ? 'A build is' : `${String(busy)} builds are`

	return `${what} still running here. Stop them first — the agent will not restart while a session is in flight.`
}
