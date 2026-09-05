import { FastifyPluginAsync } from 'fastify';
import { addUiSocket, removeUiSocket } from 'src/services/sockets/registry.service';

const routes: FastifyPluginAsync = async function (fastify) {
	fastify.get('/ws', { websocket: true }, (socket) => {
		addUiSocket(socket);

		socket.on('close', () => {
			removeUiSocket(socket);
		});
	});
};

export default routes;
