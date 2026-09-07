import { describe, expect, it } from 'vitest';
import { MAX_BACKOFF_STEPS, backoffDelay, nextAttempt } from './backoff';

describe('backoffDelay', () => {
	// Unjittered, every agent comes back at the same instant after the backend
	// restarts, which is the thundering herd the jitter exists to break up.
	it('spreads the same attempt across a band rather than one instant', () => {
		expect(backoffDelay(0, () => 0)).toBe(700);
		expect(backoffDelay(0, () => 1)).toBe(1300);
	});

	it('grows with the attempt', () => {
		const mid = () => 0.5;

		expect(backoffDelay(1, mid)).toBeGreaterThan(backoffDelay(0, mid));
		expect(backoffDelay(3, mid)).toBeGreaterThan(backoffDelay(2, mid));
	});

	// Without the cap the delay doubles without bound and a machine that was
	// briefly unreachable stays away for hours.
	it('caps the delay however many attempts have failed', () => {
		expect(backoffDelay(50, () => 1)).toBeLessThanOrEqual(Math.round(30_000 * 1.3));
	});
});

describe('nextAttempt', () => {
	it('stops counting at the cap', () => {
		expect(nextAttempt(0)).toBe(1);
		expect(nextAttempt(MAX_BACKOFF_STEPS)).toBe(MAX_BACKOFF_STEPS);
	});
});
