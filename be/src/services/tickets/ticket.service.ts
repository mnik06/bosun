import { type KeyService } from 'src/services/keys/key.service';

// Bound to the pair, not to the person: somebody with two projects open holds two
// sockets on two registry keys, and a ticket that carried only the user would let
// the second tab join the first tab's project.
export interface UiSession {
	userId: string;
	projectId: string;
}

const TICKET_TTL_MS = 15_000;

export function getTicketService(deps: { keyService: KeyService }) {
	const tickets = new Map<string, { session: UiSession; expiresAt: number }>();

	function dropExpired(now: number): void {
		for (const [ticket, entry] of tickets) {
			if (entry.expiresAt <= now) {
				tickets.delete(ticket);
			}
		}
	}

	return {
		issue(session: UiSession): { ticket: string; expiresAt: Date } {
			const now = Date.now();

			dropExpired(now);

			const ticket = deps.keyService.generateUiTicket();
			const expiresAt = now + TICKET_TTL_MS;

			tickets.set(ticket, { session, expiresAt });

			return { ticket, expiresAt: new Date(expiresAt) };
		},

		consume(ticket: string): UiSession | null {
			const entry = tickets.get(ticket);

			// Deleted on the first read whether or not it was still valid: a ticket that
			// has been presented once must never open a second socket.
			tickets.delete(ticket);

			if (!entry || entry.expiresAt <= Date.now()) {
				return null;
			}

			return entry.session;
		}
	};
}

export type TicketService = ReturnType<typeof getTicketService>;
