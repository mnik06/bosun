import { describe, expect, it } from 'vitest';
import { getGithubPatService, GithubPatError } from 'src/services/github/github-pat.service';
import { detectGithubTokenKind } from 'src/types/GithubPatSchema';

function reply(status: number, json: unknown, headers?: Record<string, string>): Response {
	return new Response(JSON.stringify(json), { status, headers });
}

describe('detectGithubTokenKind', () => {
	it('recognizes the fine-grained prefix and treats everything else as classic', () => {
		expect(detectGithubTokenKind('github_pat_11ABC')).toBe('fine_grained');
		expect(detectGithubTokenKind('ghp_abcdef')).toBe('classic');
		expect(detectGithubTokenKind('a'.repeat(40))).toBe('classic');
	});
});

const userReply = (headers?: Record<string, string>) => reply(200, { login: 'octocat' }, headers);

describe('validateAndListRepositories', () => {
	it('returns the login, token kind, and every pushable repository', async () => {
		const fetchImpl = (async (input: string | URL) => {
			const url = String(input);

			if (url.includes('/user/repos')) {
				return reply(200, [
					{ id: 1, full_name: 'acme/one', default_branch: 'main', private: true, permissions: { push: true } },
					{ id: 2, full_name: 'acme/two', default_branch: 'main', private: false, permissions: { push: false } }
				]);
			}

			return userReply({ 'x-oauth-scopes': 'repo, read:org' });
		}) as typeof fetch;

		const service = getGithubPatService({ fetchImpl });
		const result = await service.validateAndListRepositories({ pat: 'ghp_token' });

		expect(result).toMatchObject({ githubLogin: 'octocat', tokenType: 'classic' });
		expect(result.repositories).toEqual([{ githubRepoId: 1, fullName: 'acme/one', defaultBranch: 'main', private: true }]);
	});

	it('rejects a classic token missing the repo scope before listing anything', async () => {
		const fetchImpl = (async () => userReply({ 'x-oauth-scopes': 'read:org' })) as typeof fetch;
		const service = getGithubPatService({ fetchImpl });

		await expect(service.validateAndListRepositories({ pat: 'ghp_token' })).rejects.toMatchObject({ kind: 'missing_scope' });
	});

	it('accepts a fine-grained token with no X-OAuth-Scopes header at all', async () => {
		const fetchImpl = (async (input: string | URL) => {
			const url = String(input);

			return url.includes('/user/repos')
				? reply(200, [{ id: 1, full_name: 'acme/one', default_branch: 'main', private: true, permissions: { push: true } }])
				: userReply();
		}) as typeof fetch;

		const result = await getGithubPatService({ fetchImpl }).validateAndListRepositories({ pat: 'github_pat_token' });

		expect(result.tokenType).toBe('fine_grained');
	});

	it('rejects a token that cannot push to anything, distinctly from a token with no repositories at all', async () => {
		const fetchImpl = (async (input: string | URL) => {
			const url = String(input);

			return url.includes('/user/repos') ? reply(200, []) : userReply({ 'x-oauth-scopes': 'repo' });
		}) as typeof fetch;

		await expect(getGithubPatService({ fetchImpl }).validateAndListRepositories({ pat: 'ghp_token' })).rejects.toMatchObject({ kind: 'no_repositories' });
	});

	it('throws invalid_token on a 401', async () => {
		const fetchImpl = (async () => reply(401, { message: 'Bad credentials' })) as typeof fetch;

		await expect(getGithubPatService({ fetchImpl }).validateAndListRepositories({ pat: 'bad' })).rejects.toMatchObject({ kind: 'invalid_token' });
	});

	it('classifies a 403 with X-GitHub-SSO as sso_required and carries the authorization url', async () => {
		const fetchImpl = (async () =>
			reply(403, { message: 'Resource protected by organization SAML enforcement.' }, { 'x-github-sso': 'required; url=https://github.com/orgs/acme/sso?x=1' })) as typeof fetch;

		const error = await getGithubPatService({ fetchImpl })
			.validateAndListRepositories({ pat: 'bad' })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(GithubPatError);
		expect(error).toMatchObject({ kind: 'sso_required', ssoUrl: 'https://github.com/orgs/acme/sso?x=1' });
	});

	it('classifies a 403 naming an organization PAT restriction distinctly from a missing scope', async () => {
		const fetchImpl = (async () => reply(403, { message: 'This organization restricts personal access tokens.' })) as typeof fetch;

		await expect(getGithubPatService({ fetchImpl }).validateAndListRepositories({ pat: 'bad' })).rejects.toMatchObject({ kind: 'org_restricted' });
	});

	it('classifies a 403 naming a pending fine-grained approval distinctly from a missing scope', async () => {
		const fetchImpl = (async () => reply(403, { message: 'This fine-grained token has not been approved by an organization administrator.' })) as typeof fetch;

		await expect(getGithubPatService({ fetchImpl }).validateAndListRepositories({ pat: 'bad' })).rejects.toMatchObject({ kind: 'pending_approval' });
	});

	it('falls back to missing_scope for an unrecognized 403', async () => {
		const fetchImpl = (async () => reply(403, { message: 'Resource not accessible by personal access token' })) as typeof fetch;

		await expect(getGithubPatService({ fetchImpl }).validateAndListRepositories({ pat: 'bad' })).rejects.toMatchObject({ kind: 'missing_scope' });
	});

	it('classifies a 403 carrying a primary rate-limit signal as rate_limited, ahead of the SSO/org checks', async () => {
		const reset = Math.floor(Date.now() / 1000) + 30;
		const fetchImpl = (async () =>
			reply(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) })) as typeof fetch;

		const error = await getGithubPatService({ fetchImpl })
			.validateAndListRepositories({ pat: 'bad' })
			.catch((caught: unknown) => caught);

		expect(error).toMatchObject({ kind: 'rate_limited' });
		expect((error as { retryAfterMs: number }).retryAfterMs).toBeGreaterThan(0);
	});

	it('classifies a 403 carrying a Retry-After header as rate_limited using that value', async () => {
		const fetchImpl = (async () => reply(403, { message: 'secondary rate limit' }, { 'retry-after': '5' })) as typeof fetch;

		const error = await getGithubPatService({ fetchImpl })
			.validateAndListRepositories({ pat: 'bad' })
			.catch((caught: unknown) => caught);

		expect(error).toMatchObject({ kind: 'rate_limited', retryAfterMs: 5_000 });
	});
});

describe('createWebhook', () => {
	it('creates a webhook covering push and pull_request, and returns its id', async () => {
		const calls: { url: string; body: unknown }[] = [];
		const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
			calls.push({ url: String(input), body: init?.body ? JSON.parse(init.body as string) : null });

			return reply(201, { id: 42 });
		}) as typeof fetch;

		const result = await getGithubPatService({ fetchImpl }).createWebhook({ pat: 'p', fullName: 'acme/app', url: 'https://bosun.example/github/webhook/repo_1', secret: 's3cret' });

		expect(result).toEqual({ githubWebhookId: 42 });
		expect(calls[0].url).toBe('https://api.github.com/repos/acme/app/hooks');
		expect(calls[0].body).toMatchObject({ events: ['push', 'pull_request'], config: { url: 'https://bosun.example/github/webhook/repo_1', secret: 's3cret' } });
	});

	it('throws webhook_exists on a 422, distinct from any other failure', async () => {
		const fetchImpl = (async () => reply(422, { message: 'Hook already exists on this repository' })) as typeof fetch;

		await expect(
			getGithubPatService({ fetchImpl }).createWebhook({ pat: 'p', fullName: 'acme/app', url: 'https://x/y', secret: 's' })
		).rejects.toMatchObject({ kind: 'webhook_exists' });
	});

	it('throws invalid_token on a 401, the same as every other authenticated call', async () => {
		const fetchImpl = (async () => reply(401, { message: 'Bad credentials' })) as typeof fetch;

		await expect(
			getGithubPatService({ fetchImpl }).createWebhook({ pat: 'p', fullName: 'acme/app', url: 'https://x/y', secret: 's' })
		).rejects.toMatchObject({ kind: 'invalid_token' });
	});
});

describe('getWebhook', () => {
	it('returns null for a hook GitHub no longer has, rather than throwing', async () => {
		const fetchImpl = (async () => reply(404, null)) as typeof fetch;

		await expect(getGithubPatService({ fetchImpl }).getWebhook({ pat: 'p', fullName: 'acme/app', webhookId: 1 })).resolves.toBeNull();
	});

	it('reports whether an existing hook is active', async () => {
		const fetchImpl = (async () => reply(200, { active: false })) as typeof fetch;

		await expect(getGithubPatService({ fetchImpl }).getWebhook({ pat: 'p', fullName: 'acme/app', webhookId: 1 })).resolves.toEqual({ active: false });
	});
});

describe('listBranchHeads', () => {
	it('returns null on a 304 without touching the branch list', async () => {
		const fetchImpl = (async () => new Response(null, { status: 304 })) as typeof fetch;

		await expect(getGithubPatService({ fetchImpl }).listBranchHeads({ pat: 'p', fullName: 'acme/app', etag: '"abc"' })).resolves.toBeNull();
	});

	it('sends the previous etag as If-None-Match and returns the new one with every branch head on a 200', async () => {
		let sentHeaders: HeadersInit | undefined;
		const fetchImpl = (async (_input: string | URL, init?: RequestInit) => {
			sentHeaders = init?.headers;

			return reply(200, [{ name: 'main', commit: { sha: 'sha1' } }], { etag: '"new-etag"' });
		}) as typeof fetch;

		const result = await getGithubPatService({ fetchImpl }).listBranchHeads({ pat: 'p', fullName: 'acme/app', etag: '"old-etag"' });

		expect(result).toEqual({ etag: '"new-etag"', heads: [{ branch: 'main', sha: 'sha1' }] });
		expect((sentHeaders as Record<string, string>)['if-none-match']).toBe('"old-etag"');
	});
});
