import { describe, expect, it } from 'vitest';
import { classifyDocker } from './docker';

describe('classifyDocker', () => {
	it.each([
		['failed to inspect container health: docker: command not found (podman also not found)', 'missing'],
		['sh: 1: docker: not found', 'missing'],
		['not found on the service PATH', 'missing'],
		[
			'permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/info"',
			'denied'
		],
		['Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?', 'down']
	])('%s -> %s', (output, expected) => {
		expect(classifyDocker(output)).toBe(expected);
	});

	// A service fails for plenty of reasons that are not docker's, and a fix for
	// the wrong one sends the operator to change a box that was fine.
	it('names nothing for an unrelated failure', () => {
		expect(classifyDocker('sh: 1: supabase: not found\n[ELIFECYCLE] Command failed.')).toBeNull();
	});
});
