import { describe, expect, it } from 'vitest';
import { getAgentReleaseService, resolveDownloadBase } from 'src/services/agent-release/agent-release.service';

describe('resolveDownloadBase', () => {
	it('pins the base to the version bosun is asking for', () => {
		expect(
			resolveDownloadBase({ baseUrl: 'https://h/releases/download/agent-v{version}', version: '2.1.0' })
		).toBe('https://h/releases/download/agent-v2.1.0');
	});

	// A base with no placeholder still works, so an existing deployment keeps
	// serving installs while the pinned form is rolled out.
	it('leaves a base without a placeholder alone', () => {
		expect(resolveDownloadBase({ baseUrl: 'https://h/releases/latest/download', version: '2.1.0' })).toBe(
			'https://h/releases/latest/download'
		);
	});
});

describe('agent release', () => {
	const release = getAgentReleaseService({
		version: '2.1.0',
		downloadBaseUrl: 'https://h/agent-v{version}'
	});

	it('treats a matching version as current', () => {
		expect(release.isOutdated('2.1.0')).toBe(false);
	});

	// Deliberately not a semver comparison: lowering AGENT_EXPECTED_VERSION is how
	// a bad release is rolled back across the fleet, and a "newer only" check would
	// leave every machine stranded on the broken build.
	it.each([['2.0.0'], ['3.0.0']])('offers %s an upgrade in either direction', (reported) => {
		expect(release.isOutdated(reported)).toBe(true);
	});

	// A machine that has never said what it runs is not told to replace it.
	it('says nothing about a machine that has not reported a version', () => {
		expect(release.isOutdated(null)).toBe(false);
	});
});
