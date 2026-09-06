import http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { getSupabaseAuth } from 'src/services/auth/supabase-auth.service';

type Responder = (res: http.ServerResponse) => void;

let server: http.Server | null = null;

async function startAuthStub(respond: Responder): Promise<string> {
	server = http.createServer((_req, res) => respond(res));

	await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));

	const address = server.address();

	return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
}

function json(status: number, body: unknown): Responder {
	return (res) => {
		res.writeHead(status, { 'content-type': 'application/json' });
		res.end(JSON.stringify(body));
	};
}

afterEach(async () => {
	await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
	server = null;
});

async function resolveAgainst(url: string) {
	return getSupabaseAuth({ url, publishableKey: 'sb_publishable_test' }).resolveToken('a.b.c');
}

describe('resolveToken', () => {
	it('returns the account when Supabase recognises the token', async () => {
		const url = await startAuthStub(
			json(200, { id: '8e5f4a3b-0000-4000-8000-000000000001', email: 'a@b.co' })
		);

		expect(await resolveAgainst(url)).toEqual({
			status: 'ok',
			subId: '8e5f4a3b-0000-4000-8000-000000000001',
			email: 'a@b.co'
		});
	});

	it('rejects a token Supabase refuses', async () => {
		const url = await startAuthStub(json(401, { message: 'invalid claim' }));

		expect(await resolveAgainst(url)).toEqual({ status: 'rejected' });
	});

	it('rejects an account with no email, which cannot be provisioned', async () => {
		const url = await startAuthStub(json(200, { id: '8e5f4a3b-0000-4000-8000-000000000002' }));

		expect(await resolveAgainst(url)).toEqual({ status: 'rejected' });
	});

	// The fail-open guard: an outage on their side must never read as a bad
	// token on the caller's, because the two get opposite status codes.
	it('reports a Supabase 5xx as unavailable, not as a bad token', async () => {
		const url = await startAuthStub(json(503, { message: 'upstream down' }));

		expect(await resolveAgainst(url)).toEqual({ status: 'unavailable' });
	});

	it('reports a throttled request as unavailable, not as a bad token', async () => {
		const url = await startAuthStub(json(429, { message: 'slow down' }));

		expect(await resolveAgainst(url)).toEqual({ status: 'unavailable' });
	});

	it('reports an unreachable Supabase as unavailable', async () => {
		expect(await resolveAgainst('http://127.0.0.1:1')).toEqual({ status: 'unavailable' });
	});

	it('reports an unparseable answer as unavailable', async () => {
		const url = await startAuthStub((res) => {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end('not json');
		});

		expect(await resolveAgainst(url)).toEqual({ status: 'unavailable' });
	});
});
