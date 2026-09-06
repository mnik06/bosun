import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeTicket, issueTicket } from 'src/services/tickets/ticket.service';

afterEach(() => {
	vi.useRealTimers();
});

describe('ui ws tickets', () => {
	it('resolves a fresh ticket to the user it was issued for', () => {
		const { ticket } = issueTicket('u_alice');

		expect(consumeTicket(ticket)).toBe('u_alice');
	});

	it('refuses the same ticket a second time', () => {
		const { ticket } = issueTicket('u_alice');

		consumeTicket(ticket);

		expect(consumeTicket(ticket)).toBeNull();
	});

	it('refuses a ticket that was never issued', () => {
		expect(consumeTicket('not-a-ticket')).toBeNull();
	});

	it('issues distinct tickets', () => {
		expect(issueTicket('u_alice').ticket).not.toBe(issueTicket('u_alice').ticket);
	});

	it('refuses a ticket presented after it expired', () => {
		vi.useFakeTimers();

		const { ticket, expiresAt } = issueTicket('u_alice');

		vi.setSystemTime(expiresAt.getTime() + 1);

		expect(consumeTicket(ticket)).toBeNull();
	});

	it('forgets expired tickets instead of holding them forever', () => {
		vi.useFakeTimers();

		const stale = issueTicket('u_alice');

		vi.setSystemTime(stale.expiresAt.getTime() + 1);
		issueTicket('u_bob');
		vi.setSystemTime(stale.expiresAt.getTime() - 1);

		// Sweeping is what stops the map growing without bound; a ticket dropped
		// by the sweep must stay dropped even if the clock appears to go back.
		expect(consumeTicket(stale.ticket)).toBeNull();
	});
});
