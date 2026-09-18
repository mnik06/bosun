import { describe, expect, it } from 'vitest';
import { describeHttpStatus, describeStderr, readInitializeResponse } from './mcp-probe.service';

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

describe('describeStderr', () => {
	// What @azure-devops/mcp@2.10.0 printed on a headless box: the reason is above
	// the stack, and a tail of the output kept only the frames.
	it('picks the error line out of a node crash', () => {
		const stderr = [
			'npm warn deprecated prebuild-install@7.1.3: No longer maintained.',
			'node:internal/modules/cjs/loader:1929',
			'  return process.dlopen(module, path.toNamespacedPath(filename));',
			'                 ^',
			'',
			'Error: libsecret-1.so.0: cannot open shared object file: No such file or directory',
			'    at Object..node (node:internal/modules/cjs/loader:1929:14)',
			'    at Module.load (node:internal/modules/cjs/loader:1651:32) {',
			"  code: 'ERR_DLOPEN_FAILED'",
			'}',
			'',
			'Node.js v24.21.0'
		].join('\n');

		expect(describeStderr(stderr)).toBe(
			'Error: libsecret-1.so.0: cannot open shared object file: No such file or directory'
		);
	});

	it('recognises named and coded errors', () => {
		expect(describeStderr('TypeError: x is not a function\n    at y')).toBe('TypeError: x is not a function');
		expect(describeStderr('Error [ERR_MODULE_NOT_FOUND]: Cannot find package')).toBe(
			'Error [ERR_MODULE_NOT_FOUND]: Cannot find package'
		);
	});

	it('falls back to the tail, then to "no output"', () => {
		expect(describeStderr('invalid organization\n')).toBe('invalid organization');
		expect(describeStderr('   ')).toBe('no output');
	});
});
