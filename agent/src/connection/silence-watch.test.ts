import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchSilence } from './silence-watch';

function fakeSocket() {
	const socket = Object.assign(new EventEmitter(), { terminate: vi.fn() });

	watchSilence(socket as unknown as WebSocket, 1000);

	return socket;
}

describe('watchSilence', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('drops a connection that goes quiet after opening', () => {
		const socket = fakeSocket();

		socket.emit('open');
		vi.advanceTimersByTime(1000);

		expect(socket.terminate).toHaveBeenCalledOnce();
	});

	it('keeps a connection the backend keeps pinging', () => {
		const socket = fakeSocket();

		socket.emit('open');

		for (let i = 0; i < 5; i += 1) {
			vi.advanceTimersByTime(900);
			socket.emit(i % 2 === 0 ? 'ping' : 'message');
		}

		expect(socket.terminate).not.toHaveBeenCalled();
	});

	// A closed socket is already being replaced; terminating it later would be a
	// stray call on a connection the loop has moved past.
	it('stops watching once the socket closes', () => {
		const socket = fakeSocket();

		socket.emit('open');
		socket.emit('close');
		vi.advanceTimersByTime(5000);

		expect(socket.terminate).not.toHaveBeenCalled();
	});
});
