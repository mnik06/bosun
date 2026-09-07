import { type WebSocket } from '@fastify/websocket';
import { type RawData } from 'ws';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UiWsQuerySchema } from 'src/api/routes/schemas/ui/UiWsQuerySchema';
import {
	addUiSocket,
	removeUiSocket,
	subscribeUiToPlan,
	unsubscribeUiFromPlan
} from 'src/services/sockets/registry.service';
import { consumeTicket } from 'src/services/tickets/ticket.service';
import { UiCommandSchema } from 'src/types/protocol';

// Subscribing is an authorization decision, not a routing one: without the owner
// check any signed-in account could name somebody else's plan id and receive its
// whole transcript.
async function handleCommand(opts: {
	fastify: FastifyInstance;
	socket: WebSocket;
	userId: string;
	raw: string;
}): Promise<void> {
	let json: unknown;

	try {
		json = JSON.parse(opts.raw);
	} catch {
		return;
	}

	const parsed = UiCommandSchema.safeParse(json);

	if (!parsed.success) {
		return;
	}

	if (parsed.data.type === 'plan.unsubscribe') {
		unsubscribeUiFromPlan({ planId: parsed.data.planId, socket: opts.socket });

		return;
	}

	const plan = await opts.fastify.repos.planRepo.getOwnedById({
		id: parsed.data.planId,
		userId: opts.userId
	});

	if (plan) {
		subscribeUiToPlan({ planId: plan.id, socket: opts.socket });
	}
}

const routes: FastifyPluginAsync = async function (fastify) {
	// A browser cannot set headers on a WebSocket handshake, so the credential
	// travels in the query string, where proxies log it. It is therefore a
	// single-use ticket that expires in seconds, not the bearer token itself.
	fastify.addHook('preValidation', async (request, reply) => {
		const query = UiWsQuerySchema.safeParse(request.query);
		const userId = query.success ? consumeTicket(query.data.ticket) : null;

		if (!userId) {
			return reply.status(401).send({ message: 'Unauthorized' });
		}

		request.uiUserId = userId;
	});

	fastify.get('/ws', { websocket: true }, (socket, request) => {
		const userId = request.uiUserId!;

		addUiSocket({ userId, socket });

		socket.on('message', (raw: RawData) => {
			void handleCommand({ fastify, socket, userId, raw: raw.toString() });
		});

		socket.on('close', () => {
			removeUiSocket({ userId, socket });
		});
	});
};

export default routes;
