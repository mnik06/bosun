import type WebSocket from 'ws';

// The backend pings every 15s, so three periods without a ping or a frame means
// the connection is gone. Through Fly's proxy a socket the backend terminated
// for missed pongs can stay ESTABLISHED here with no close ever arriving, and
// without this the agent sits on it while the machine reads offline for good.
export const SILENCE_LIMIT_MS = 45_000;

export function watchSilence(socket: WebSocket, limitMs = SILENCE_LIMIT_MS): WebSocket {
	let timer: NodeJS.Timeout | null = null;

	const arm = () => {
		if (timer) {
			clearTimeout(timer);
		}

		timer = setTimeout(() => {
			console.error(`no word from bosun in ${limitMs / 1000}s; dropping the connection`);
			socket.terminate();
		}, limitMs);
	};

	socket.on('open', arm);
	socket.on('ping', arm);
	socket.on('message', arm);
	socket.on('close', () => {
		if (timer) {
			clearTimeout(timer);
		}
	});

	return socket;
}
