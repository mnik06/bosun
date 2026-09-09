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
	it('resolves a fresh ticket to the pair it was issued for', () => {
		const { ticket } = tickets.issue({ userId: 'u_alice', projectId: 'prj_1' });

		expect(tickets.consume(ticket)).toEqual({ userId: 'u_alice', projectId: 'prj_1' });
	});

	it('refuses the same ticket a second time', () => {
		const { ticket } = tickets.issue({ userId: 'u_alice', projectId: 'prj_1' });

		tickets.consume(ticket);

		expect(tickets.consume(ticket)).toBeNull();
	});

	it('refuses a ticket that was never issued', () => {
		expect(tickets.consume('not-a-ticket')).toBeNull();
	});

	it('issues distinct tickets', () => {
		const first = tickets.issue({ userId: 'u_alice', projectId: 'prj_1' });
		const second = tickets.issue({ userId: 'u_alice', projectId: 'prj_1' });

		expect(first.ticket).not.toBe(second.ticket);
	});

	// Two tabs on two projects hold two sockets on two registry keys. A ticket that
	// carried only the person would let the second tab join the first tab's project.
	it('keeps the project of each ticket separate', () => {
		const alice = tickets.issue({ userId: 'u_alice', projectId: 'prj_1' });
		const sameAliceElsewhere = tickets.issue({ userId: 'u_alice', projectId: 'prj_2' });

		expect(tickets.consume(alice.ticket)).toEqual({ userId: 'u_alice', projectId: 'prj_1' });
		expect(tickets.consume(sameAliceElsewhere.ticket)).toEqual({
			userId: 'u_alice',
			projectId: 'prj_2'
		});
	});

	it('refuses a ticket presented after it expired', () => {
		vi.useFakeTimers();

		const { ticket, expiresAt } = tickets.issue({ userId: 'u_alice', projectId: 'prj_1' });

		vi.setSystemTime(expiresAt.getTime() + 1);

		expect(tickets.consume(ticket)).toBeNull();
	});

	it('forgets expired tickets instead of holding them forever', () => {
		vi.useFakeTimers();

		const stale = tickets.issue({ userId: 'u_alice', projectId: 'prj_1' });

		vi.setSystemTime(stale.expiresAt.getTime() + 1);
		tickets.issue({ userId: 'u_bob', projectId: 'prj_2' });
		vi.setSystemTime(stale.expiresAt.getTime() - 1);

		// Sweeping is what stops the map growing without bound; a ticket dropped
		// by the sweep must stay dropped even if the clock appears to go back.
		expect(tickets.consume(stale.ticket)).toBeNull();
	});
});
