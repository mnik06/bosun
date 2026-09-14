import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
	getGithubAppService,
	normalizePrivateKey,
	signAppJwt,
	signInstallState,
	verifyInstallState,
	verifyWebhookSignature
} from 'src/services/github/github-app.service';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

describe('signAppJwt', () => {
	it('signs an RS256 token GitHub can verify, inside its ten-minute ceiling', () => {
		const [head, body, signature] = signAppJwt({ appId: '123', privateKey: pem, now: NOW }).split('.');
		const payload = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')) as { iat: number; exp: number; iss: string };

		expect(
			crypto.verify('RSA-SHA256', Buffer.from(`${head}.${body}`), publicKey, Buffer.from(signature!, 'base64url'))
		).toBe(true);
		expect(payload.iss).toBe('123');
		expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
		expect(payload.iat).toBeLessThan(NOW / 1000);
	});

	it('reads a key pasted into an env file with escaped newlines', () => {
		const escaped = pem.replace(/\n/g, '\\n');

		expect(() => signAppJwt({ appId: '1', privateKey: normalizePrivateKey(escaped), now: NOW })).not.toThrow();
	});
});

describe('install state', () => {
	const clientSecret = 'secret';
	const state = signInstallState({ clientSecret, userId: 'u_1', projectId: 'prj_1', now: NOW });
	const verify = (overrides: Partial<{ state: string; userId: string; projectId: string; now: number }>) =>
		verifyInstallState({ clientSecret, state, userId: 'u_1', projectId: 'prj_1', now: NOW, ...overrides });

	it('is accepted for the user and project it was issued for', () => {
		expect(verify({})).toBe(true);
	});

	// A callback link forwarded to somebody else, or replayed into another project,
	// must not connect an installation there.
	it('is refused for another user, another project, or after it expires', () => {
		expect(verify({ userId: 'u_2' })).toBe(false);
		expect(verify({ projectId: 'prj_2' })).toBe(false);
		expect(verify({ now: NOW + 31 * 60 * 1000 })).toBe(false);
	});

	it('is refused when its payload was edited, or it was signed with another secret', () => {
		const [, mac] = state.split('.');
		const forged = Buffer.from(JSON.stringify({ u: 'u_1', p: 'prj_2', e: NOW + 60_000 })).toString('base64url');

		expect(verify({ state: `${forged}.${mac}`, projectId: 'prj_2' })).toBe(false);
		expect(
			verifyInstallState({ clientSecret: 'other', state, userId: 'u_1', projectId: 'prj_1', now: NOW })
		).toBe(false);
	});
});

// An unsigned merge event would mark a plan merged and start every plan stacked on
// it, so a delivery is only as trusted as its signature over the exact bytes sent.
describe('verifyWebhookSignature', () => {
	const secret = 'webhook-secret-of-some-length';
	const payload = Buffer.from('{"action":"closed","pull_request":{"merged":true}}');
	const signed = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;

	it('accepts a delivery signed with the secret', () => {
		expect(verifyWebhookSignature({ secret, payload, signature: signed })).toBe(true);
	});

	it('refuses a missing, malformed, foreign or re-serialized signature', () => {
		expect(verifyWebhookSignature({ secret, payload, signature: undefined })).toBe(false);
		expect(verifyWebhookSignature({ secret, payload, signature: 'sha1=abc' })).toBe(false);
		expect(verifyWebhookSignature({ secret: 'another-secret-entirely', payload, signature: signed })).toBe(false);
		expect(verifyWebhookSignature({ secret, payload: Buffer.from('{"action": "closed"}'), signature: signed })).toBe(false);
	});
});

describe('openOrUpdatePullRequest', () => {
	const NO_COMMITS = { message: 'Validation Failed', errors: [{ resource: 'PullRequest', code: 'custom', message: 'No commits between main and bosun/onboarding' }] };
	const request = { installationId: 1, githubRepoId: 7, head: 'bosun/onboarding', base: 'main', title: 't', body: 'b' };

	function github(opts: { refusals: number }) {
		const posts: string[] = [];
		const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status });
		const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);

			if (url.endsWith('/access_tokens')) {
				return reply(201, { token: 't', expires_at: new Date(NOW + 3_600_000).toISOString() });
			}

			if (url.endsWith('/repositories/7')) {
				return reply(200, { id: 7, full_name: 'acme/app', default_branch: 'main', private: true, clone_url: 'https://github.com/acme/app.git' });
			}

			if (url.endsWith('/repos/acme/app/pulls') && init?.method === 'POST') {
				posts.push(url);

				return posts.length <= opts.refusals ? reply(422, NO_COMMITS) : reply(201, { number: 12, html_url: 'https://github.com/acme/app/pull/12' });
			}

			return url.includes('/pulls?state=open') ? reply(200, []) : reply(404, { message: 'Not Found' });
		}) as typeof fetch;
		const service = getGithubAppService({
			appId: '1',
			slug: 'bosun',
			clientId: 'client',
			clientSecret: 'secret',
			privateKey: pem,
			fetchImpl,
			now: () => NOW,
			sleep: async () => {}
		});

		return { service, posts };
	}

	// The branch was committed to a moment before; GitHub can still count no
	// commits on it, and a refusal then is a state that settles, not a failure.
	it('asks again while GitHub still sees no commits on a branch just written', async () => {
		const { service, posts } = github({ refusals: 2 });

		await expect(service.openOrUpdatePullRequest(request)).resolves.toEqual({
			url: 'https://github.com/acme/app/pull/12',
			number: 12,
			updated: false
		});
		expect(posts).toHaveLength(3);
	});

	it('gives up with the reason GitHub gave, not only "Validation Failed"', async () => {
		const { service, posts } = github({ refusals: 10 });

		await expect(service.openOrUpdatePullRequest(request)).rejects.toThrow(
			'could not open the pull request: GitHub answered 422 — Validation Failed (No commits between main and bosun/onboarding)'
		);
		expect(posts).toHaveLength(4);
	});
});
