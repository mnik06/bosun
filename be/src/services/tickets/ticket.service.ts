import { type KeyService } from 'src/services/keys/key.service';

const TICKET_TTL_MS = 15_000;

export function getTicketService(deps: { keyService: KeyService }) {
	const tickets = new Map<string, { userId: string; expiresAt: number }>();

	function dropExpired(now: number): void {
		for (const [ticket, entry] of tickets) {
			if (entry.expiresAt <= now) {
				tickets.delete(ticket);
			}
		}
	}

	return {
		issue(userId: string): { ticket: string; expiresAt: Date } {
			const now = Date.now();

			dropExpired(now);

			const ticket = deps.keyService.generateUiTicket();
			const expiresAt = now + TICKET_TTL_MS;

			tickets.set(ticket, { userId, expiresAt });

			return { ticket, expiresAt: new Date(expiresAt) };
		},

		consume(ticket: string): string | null {
			const entry = tickets.get(ticket);

			// Deleted on the first read whether or not it was still valid: a ticket that
			// has been presented once must never open a second socket.
			tickets.delete(ticket);

			if (!entry || entry.expiresAt <= Date.now()) {
				return null;
			}

			return entry.userId;
		}
	};
}

export type TicketService = ReturnType<typeof getTicketService>;
