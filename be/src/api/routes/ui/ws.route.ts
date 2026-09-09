import { type WebSocket } from '@fastify/websocket';
import { type RawData } from 'ws';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UiWsQuerySchema } from 'src/api/routes/schemas/ui/UiWsQuerySchema';
import { UiCommandSchema } from 'src/types/protocol';

// Subscribing is an authorization decision, not a routing one: without the
// project check any signed-in account could name another tenant's plan id and
// receive its whole transcript.
async function handleCommand(opts: {
	fastify: FastifyInstance;
	socket: WebSocket;
	projectId: string;
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
		opts.fastify.services.socketRegistry.unsubscribeUiFromPlan({
			planId: parsed.data.planId,
			socket: opts.socket
		});

		return;
	}

	const plan = await opts.fastify.repos.planRepo.getOwnedById({
		id: parsed.data.planId,
		projectId: opts.projectId
	});

	if (plan) {
		opts.fastify.services.socketRegistry.subscribeUiToPlan({
			planId: plan.id,
			socket: opts.socket
		});
	}
}

const routes: FastifyPluginAsync = async function (fastify) {
	// A browser cannot set headers on a WebSocket handshake, so the credential
	// travels in the query string, where proxies log it. It is therefore a
	// single-use ticket that expires in seconds, not the bearer token itself.
	fastify.addHook('preValidation', async (request, reply) => {
		const query = UiWsQuerySchema.safeParse(request.query);
		const session = query.success
			? fastify.services.ticketService.consume(query.data.ticket)
			: null;

		if (!session) {
			return reply.status(401).send({ message: 'Unauthorized' });
		}

		request.uiSession = session;
	});

	fastify.get('/ws', { websocket: true }, (socket, request) => {
		const { userId, projectId } = request.uiSession!;

		fastify.services.socketRegistry.addUiSocket({ projectId, userId, socket });

		socket.on('message', (raw: RawData) => {
			void handleCommand({ fastify, socket, projectId, raw: raw.toString() });
		});

		socket.on('close', () => {
			fastify.services.socketRegistry.removeUiSocket({ projectId, socket });
		});
	});
};

export default routes;
