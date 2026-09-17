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
});
