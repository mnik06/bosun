import { describe, expect, it, vi } from 'vitest';
import {
	getAgentReleaseService,
	parseTagVersion,
	resolveDownloadBase
} from 'src/services/agent-release/agent-release.service';

describe('parseTagVersion', () => {
	it.each([
		['https://h/o/r/releases/tag/agent-v2.0.7', '2.0.7'],
		['https://h/o/r/releases/tag/v1.2.3', '1.2.3'],
		['https://h/o/r/releases/tag/agent-v2.1.0-rc.1', '2.1.0-rc.1']
	])('%s -> %s', (url, expected) => {
		expect(parseTagVersion(url)).toBe(expected);
	});

	// A redirect that did not land on a tag must not be read as a version, or
	// every machine gets offered an upgrade to nonsense.
	it.each([['https://h/o/r/releases'], ['https://h/o/r/releases/tag/nightly'], ['']])(
		'refuses %j',
		(url) => {
			expect(parseTagVersion(url)).toBeNull();
		}
	);
});

describe('resolveDownloadBase', () => {
	it('pins the base to the version being offered', () => {
		expect(
			resolveDownloadBase({ baseUrl: 'https://h/download/agent-v{version}', version: '2.1.0' })
		).toBe('https://h/download/agent-v2.1.0');
	});
});

const DOWNLOAD = 'https://h/download/agent-v{version}';

describe('resolving what to run', () => {
	it('offers the newest published release without any version configured here', async () => {
		const release = getAgentReleaseService({
			latestReleaseUrl: 'https://h/releases/latest',
			downloadBaseUrl: DOWNLOAD,
			resolveLatest: async () => '2.1.0'
		});

		expect(await release.target('2.0.0')).toEqual({
			version: '2.1.0',
			downloadBaseUrl: 'https://h/download/agent-v2.1.0'
		});
	});

	it('offers nothing to a machine already on the newest release', async () => {
		const release = getAgentReleaseService({
			latestReleaseUrl: 'https://h/releases/latest',
			downloadBaseUrl: DOWNLOAD,
			resolveLatest: async () => '2.1.0'
		});

		expect(await release.target('2.1.0')).toBeNull();
	});

	// The rollback lever. A pin below what a machine runs is a deliberate
	// downgrade, so it has to win over whatever "latest" says.
	it('lets a pinned version override the newest release, in either direction', async () => {
		const release = getAgentReleaseService({
			pinnedVersion: '2.0.0',
			latestReleaseUrl: 'https://h/releases/latest',
			downloadBaseUrl: DOWNLOAD,
			resolveLatest: async () => '2.1.0'
		});

		expect(await release.target('2.1.0')).toMatchObject({ version: '2.0.0' });
	});

	// Fail closed. Guessing here would offer every machine an upgrade to nothing.
	it.each([
		['the lookup fails', async () => null],
		['the lookup throws', async () => { throw new Error('offline'); }]
	])('offers nothing when %s', async (_case, resolveLatest) => {
		const release = getAgentReleaseService({
			latestReleaseUrl: 'https://h/releases/latest',
			downloadBaseUrl: DOWNLOAD,
			resolveLatest: resolveLatest as () => Promise<string | null>
		});

		expect(await release.target('2.0.0')).toBeNull();
	});

	it('offers nothing when neither a pin nor a lookup URL is configured', async () => {
		const release = getAgentReleaseService({ downloadBaseUrl: DOWNLOAD });

		expect(await release.target('2.0.0')).toBeNull();
	});

	it('says nothing about a machine that has not reported a version', async () => {
		const release = getAgentReleaseService({
			pinnedVersion: '2.1.0',
			downloadBaseUrl: DOWNLOAD
		});

		expect(await release.target(null)).toBeNull();
	});

	// Refresh is a button a person clicks; without a cache each click is a request
	// to the release host.
	it('caches the lookup rather than asking on every refresh', async () => {
		const resolveLatest = vi.fn().mockResolvedValue('2.1.0');
		const release = getAgentReleaseService({
			latestReleaseUrl: 'https://h/releases/latest',
			downloadBaseUrl: DOWNLOAD,
			resolveLatest,
			now: () => 1_000
		});

		await release.target('2.0.0');
		await release.target('2.0.0');

		expect(resolveLatest).toHaveBeenCalledOnce();
	});

	// Publishing a release and refreshing straight afterwards is the normal way to
	// ship an agent, and a cache that outlives that makes it look like nothing
	// happened — no offer, no log line, nothing to chase.
	it('notices a release published since the last lookup', async () => {
		const resolveLatest = vi
			.fn()
			.mockResolvedValueOnce('2.1.0')
			.mockResolvedValueOnce('2.1.1');
		let clock = 1_000;
		const release = getAgentReleaseService({
			latestReleaseUrl: 'https://h/releases/latest',
			downloadBaseUrl: DOWNLOAD,
			resolveLatest,
			now: () => clock
		});

		await release.target('2.0.0');
		clock += 31_000;

		expect(await release.target('2.1.0')).toMatchObject({ version: '2.1.1' });
	});

	// The exact shape that broke a live fleet: the backend names 2.0.11, a base
	// pointing at `latest` hands the agent 2.0.12, and the agent's version probe
	// rejects it. Every upgrade fails, and nothing anywhere says why.
	it('offers nothing when the download base cannot name a version', async () => {
		const resolveLatest = vi.fn().mockResolvedValue('2.1.0');
		const release = getAgentReleaseService({
			latestReleaseUrl: 'https://h/releases/latest',
			downloadBaseUrl: 'https://h/releases/latest/download',
			resolveLatest
		});

		expect(await release.target('2.0.0')).toBeNull();
		expect(release.misconfigured).toContain('AGENT_DOWNLOAD_BASE_URL');
	});

	it('has nothing to complain about when the base names a version', () => {
		expect(
			getAgentReleaseService({ pinnedVersion: '2.1.0', downloadBaseUrl: DOWNLOAD }).misconfigured
		).toBeNull();
	});

	// A brief outage at the release host must not make every machine look current.
	it('falls back to the last good answer when a later lookup fails', async () => {
		const resolveLatest = vi
			.fn()
			.mockResolvedValueOnce('2.1.0')
			.mockRejectedValue(new Error('offline'));
		let clock = 0;
		const release = getAgentReleaseService({
			latestReleaseUrl: 'https://h/releases/latest',
			downloadBaseUrl: DOWNLOAD,
			resolveLatest,
			now: () => clock
		});

		await release.target('2.0.0');
		clock = 10 * 60 * 1000;

		expect(await release.target('2.0.0')).toMatchObject({ version: '2.1.0' });
	});
});
