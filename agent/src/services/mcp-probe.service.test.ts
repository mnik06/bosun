import { describe, expect, it } from 'vitest';
import { describeHttpStatus, readInitializeResponse } from './mcp-probe.service';

describe('readInitializeResponse', () => {
	it('accepts a well-formed initialize result', () => {
		const raw = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'tix' } } });

		expect(readInitializeResponse(raw)).toEqual({ ok: true, detail: 'connected to tix' });
	});

	it('accepts a result with no serverInfo', () => {
		expect(readInitializeResponse('{"result":{}}')).toMatchObject({ ok: true });
	});

	// A JSON-RPC error is the server answering "no", which is a different thing
	// from the server not being there, and the operator needs its words.
	it('surfaces a JSON-RPC error message verbatim', () => {
		const raw = JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'bad token' } });

		expect(readInitializeResponse(raw)).toEqual({ ok: false, detail: 'bad token' });
	});

	it('locates the object after leading noise on stdout', () => {
		expect(readInitializeResponse('installing...\n{"result":{}}')).toMatchObject({ ok: true });
	});

	it.each([[''], ['not json at all'], ['{"jsonrpc":"2.0","id":1}']])(
		'reports %j as no usable answer',
		(raw) => {
			expect(readInitializeResponse(raw).ok).toBe(false);
		}
	);
});

describe('describeHttpStatus', () => {
	// 401 and 403 mean different things to whoever has to fix it: one is the wrong
	// credential, the other is a credential that is not allowed to be used.
	it('separates a refused credential from a forbidden one', () => {
		expect(describeHttpStatus(401)).toContain('refused');
		expect(describeHttpStatus(403)).toContain('not permitted');
	});

	it('names a missing endpoint', () => {
		expect(describeHttpStatus(404)).toContain('no MCP endpoint');
	});

	it('falls back to the bare status', () => {
		expect(describeHttpStatus(500)).toBe('HTTP 500');
	});
});
