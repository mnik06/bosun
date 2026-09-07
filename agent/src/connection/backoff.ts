const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export const MAX_BACKOFF_STEPS = 5;

// Jittered, because an unjittered backoff brings every agent back at the same
// instant after the backend restarts.
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
	const capped = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);

	return Math.round(capped * (0.7 + random() * 0.6));
}

export function nextAttempt(attempt: number): number {
	return Math.min(attempt + 1, MAX_BACKOFF_STEPS);
}
