import { spawn } from 'child_process';

const PROBE_TIMEOUT_MS = 15_000;
const PROTOCOL_VERSION = '2025-06-18';

const INITIALIZE = {
	jsonrpc: '2.0',
	id: 1,
	method: 'initialize',
	params: {
		protocolVersion: PROTOCOL_VERSION,
		capabilities: {},
		clientInfo: { name: 'bosun-agent', version: '1' }
	}
};

export interface ProbeResult {
	ok: boolean;
	detail: string;
}

// The server answers `initialize` before it answers anything else, so it is the
// cheapest thing that proves the endpoint exists, is reachable and accepts the
// credential. A tools/list would prove more but costs a second round trip for a
// question nobody asked yet.
export function readInitializeResponse(raw: string): ProbeResult {
	const start = raw.indexOf('{');

	if (start === -1) {
		return { ok: false, detail: 'no JSON-RPC response' };
	}

	let message: { result?: { serverInfo?: { name?: string } }; error?: { message?: string } };

	try {
		message = JSON.parse(raw.slice(start)) as typeof message;
	} catch {
		return { ok: false, detail: `unreadable response: ${raw.slice(0, 80)}` };
	}

	if (message.error) {
		return { ok: false, detail: message.error.message ?? 'server returned an error' };
	}

	return message.result
		? { ok: true, detail: `connected${message.result.serverInfo?.name ? ` to ${message.result.serverInfo.name}` : ''}` }
		: { ok: false, detail: 'no result in the initialize response' };
}

// The status is the answer for the failures that matter here. 401 is a credential
// the server refused; 403 is usually a credential it understood but is not
// allowed to use, which for a hosted server means the account or the org has not
// enabled this kind of access.
export function describeHttpStatus(status: number): string {
	if (status === 401) {
		return '401 — the credential was refused';
	}

	if (status === 403) {
		return '403 — the credential was understood but not permitted (check org/admin settings and token scopes)';
	}

	if (status === 404) {
		return '404 — no MCP endpoint at that URL';
	}

	return `HTTP ${status}`;
}

async function probeHttp(server: { url: string; headers?: Record<string, string> }): Promise<ProbeResult> {
	let response: Response;

	try {
		response = await fetch(server.url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				// Streamable HTTP servers may answer either way and reject a request
				// that does not say it accepts both.
				accept: 'application/json, text/event-stream',
				...server.headers
			},
			body: JSON.stringify(INITIALIZE),
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
		});
	} catch (error) {
		return { ok: false, detail: `unreachable: ${error instanceof Error ? error.message : 'failed'}` };
	}

	if (!response.ok) {
		return { ok: false, detail: describeHttpStatus(response.status) };
	}

	return readInitializeResponse(await response.text());
}

async function probeStdio(server: {
	command: string;
	args?: string[];
	env?: Record<string, string>;
}): Promise<ProbeResult> {
	return new Promise<ProbeResult>((resolve) => {
		const child = spawn(server.command, server.args ?? [], {
			env: { ...process.env, ...server.env },
			stdio: ['pipe', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';
		let settled = false;

		const settle = (result: ProbeResult) => {
			if (settled) {
				return;
			}

			settled = true;
			clearTimeout(timer);
			child.kill('SIGKILL');
			resolve(result);
		};

		const timer = setTimeout(() => {
			// A stdio server that never answers is usually one that is still being
			// downloaded by npx, which is the same thing a session start would hit.
			settle({ ok: false, detail: `no answer in ${PROBE_TIMEOUT_MS / 1000}s (still installing?)` });
		}, PROBE_TIMEOUT_MS);

		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');

		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;

			if (stdout.includes('\n')) {
				settle(readInitializeResponse(stdout));
			}
		});

		child.stderr.on('data', (chunk: string) => {
			stderr = `${stderr}${chunk}`.slice(-200);
		});

		child.on('error', (error) => {
			settle({ ok: false, detail: `could not start: ${error.message}` });
		});

		child.on('exit', (code) => {
			settle({ ok: false, detail: `exited with ${code ?? 'a signal'}: ${stderr.trim() || 'no output'}` });
		});

		child.stdin.write(`${JSON.stringify(INITIALIZE)}\n`);
	});
}

export function getMcpProbeService() {
	return {
		async probe(server: unknown): Promise<ProbeResult> {
			const definition = server as {
				type?: string;
				url?: string;
				headers?: Record<string, string>;
				command?: string;
				args?: string[];
				env?: Record<string, string>;
			};

			if (definition.type === 'http' && definition.url) {
				return probeHttp({ url: definition.url, headers: definition.headers });
			}

			if (definition.command) {
				return probeStdio({
					command: definition.command,
					args: definition.args,
					env: definition.env
				});
			}

			return { ok: false, detail: 'not an http or stdio server definition' };
		}
	};
}

export type McpProbeService = ReturnType<typeof getMcpProbeService>;
