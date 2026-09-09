const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

// Two units at most, largest first: a bullet that took 78 minutes reads as
// "1h 18m", and nobody watching a queue needs the seconds once it is past a
// minute. Sub-minute keeps them, because that is the whole of what it says.
export function formatDuration (ms: number): string {
	if (ms < SECOND) {
		return '0s'
	}

	if (ms < MINUTE) {
		return `${Math.floor(ms / SECOND)}s`
	}

	if (ms < HOUR) {
		return `${Math.floor(ms / MINUTE)}m ${Math.floor((ms % MINUTE) / SECOND)}s`
	}

	return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`
}
