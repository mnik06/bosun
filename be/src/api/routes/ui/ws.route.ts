import { FastifyPluginAsync } from 'fastify';
import { UiWsQuerySchema } from 'src/api/routes/schemas/ui/UiWsQuerySchema';
import { addUiSocket, removeUiSocket } from 'src/services/sockets/registry.service';
import { consumeTicket } from 'src/services/tickets/ticket.service';

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

		socket.on('close', () => {
			removeUiSocket({ userId, socket });
		});
	});
};

export default routes;
