import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKeyService } from 'src/services/keys/key.service';
import { getTicketService, type TicketService } from 'src/services/tickets/ticket.service';

let tickets: TicketService;

beforeEach(() => {
	tickets = getTicketService({ keyService: getKeyService() });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('ui ws tickets', () => {
	it('resolves a fresh ticket to the user it was issued for', () => {
		const { ticket } = tickets.issue('u_alice');

		expect(tickets.consume(ticket)).toBe('u_alice');
	});

	it('refuses the same ticket a second time', () => {
		const { ticket } = tickets.issue('u_alice');

		tickets.consume(ticket);

		expect(tickets.consume(ticket)).toBeNull();
	});

	it('refuses a ticket that was never issued', () => {
		expect(tickets.consume('not-a-ticket')).toBeNull();
	});

	it('issues distinct tickets', () => {
		expect(tickets.issue('u_alice').ticket).not.toBe(tickets.issue('u_alice').ticket);
	});

	it('refuses a ticket presented after it expired', () => {
		vi.useFakeTimers();

		const { ticket, expiresAt } = tickets.issue('u_alice');

		vi.setSystemTime(expiresAt.getTime() + 1);

		expect(tickets.consume(ticket)).toBeNull();
	});

	it('forgets expired tickets instead of holding them forever', () => {
		vi.useFakeTimers();

		const stale = tickets.issue('u_alice');

		vi.setSystemTime(stale.expiresAt.getTime() + 1);
		tickets.issue('u_bob');
		vi.setSystemTime(stale.expiresAt.getTime() - 1);

		// Sweeping is what stops the map growing without bound; a ticket dropped
		// by the sweep must stay dropped even if the clock appears to go back.
		expect(tickets.consume(stale.ticket)).toBeNull();
	});
});
