// The line's provider-agnostic surface: every git operation the line uses,
// scoped to one already-attached repository. `gitProviderFor` (line-deps'
// git-provider-for.ts) is what resolves one of these from a `Repository` row —
// nothing here names a repository or a connection itself, since that is already
// bound by the time a caller holds one. `listRepositories` is deliberately not
// part of this shape: it is asked before a repository row exists (the attach
// picker), of a connection rather than of one repository, and stays on
// `GithubAppService`/`AzureDevOpsService` directly.
export interface GitProviderRepository {
	fullName: string;
	defaultBranch: string;
	cloneUrl: string;
}

export interface GitProviderPullRequest {
	number: number;
	url: string;
	state: 'open' | 'closed';
	merged: boolean;
	baseRef: string;
	baseSha: string;
	headRef: string;
}

export interface GitProvider {
	getRepository(): Promise<GitProviderRepository>;
	readFile(opts: { path: string; ref: string }): Promise<string | null>;
	proposeFile(opts: { branch: string; path: string; content: string; message: string; title: string; body: string }): Promise<{ url: string }>;
	pointBranch(opts: { branch: string; sha: string }): Promise<void>;
	openOrUpdatePullRequest(opts: { head: string; base: string; title: string; body: string }): Promise<{ url: string; number: number; updated: boolean }>;
	getPullRequest(opts: { number: number }): Promise<GitProviderPullRequest>;
	editPullRequest(opts: { number: number; base?: string; body?: string }): Promise<void>;
	repositoryToken(): Promise<{ token: string; expiresAt: Date }>;
}
