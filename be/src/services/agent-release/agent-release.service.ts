const VERSION_PLACEHOLDER = '{version}';
// Short on purpose. The lookup is one unauthenticated HEAD, so the cache is only
// there to keep a fleet refreshing at once from making a burst of them — and a
// long window means publishing a release and refreshing straight away silently
// does nothing, which reads as the upgrade being broken rather than as the
// backend not having noticed yet.
const LATEST_TTL_MS = 30 * 1000;

// A base pointing at `releases/latest` cannot express "this exact build", so a
// bad release could not be rolled back by changing configuration — every machine
// would keep fetching whatever `latest` had become.
export function resolveDownloadBase(opts: { baseUrl: string; version: string }): string {
	return opts.baseUrl.replaceAll(VERSION_PLACEHOLDER, opts.version);
}

// `https://host/owner/repo/releases/latest` redirects to the newest tag, so the
// final URL names it: `.../releases/tag/agent-v2.0.7`. Reading the version out of
// the tag rather than calling an API keeps this free of API rate limits and of
// any credential.
export function parseTagVersion(finalUrl: string): string | null {
	const tag = finalUrl.split('/').filter(Boolean).pop() ?? '';
	const match = /(\d+\.\d+\.\d+[^/]*)$/.exec(tag);

	return match ? match[1]! : null;
}

async function followToTag(url: string): Promise<string | null> {
	const response = await fetch(url, {
		method: 'HEAD',
		redirect: 'follow',
		signal: AbortSignal.timeout(10_000)
	});

	return response.ok ? parseTagVersion(response.url) : null;
}

export function getAgentReleaseService(deps: {
	pinnedVersion?: string;
	latestReleaseUrl?: string;
	downloadBaseUrl: string;
	resolveLatest?: (url: string) => Promise<string | null>;
	now?: () => number;
}) {
	const resolveLatest = deps.resolveLatest ?? followToTag;
	const now = deps.now ?? Date.now;
	// A base with no {version} in it fetches whatever `latest` has become, which
	// need not be the version a machine was told to install — the agent's own
	// version probe then rejects the download and the upgrade fails on every
	// attempt. Offering nothing is the honest answer, and it fails where somebody
	// can see it rather than on a box with no inbound port.
	const canNameVersion = deps.downloadBaseUrl.includes(VERSION_PLACEHOLDER);

	let cached: { version: string; at: number } | null = null;

	// Pinning wins over discovery on purpose: AGENT_EXPECTED_VERSION is the lever
	// that rolls a bad release back, and a lever that "latest" could override is
	// not a lever.
	async function currentVersion(): Promise<string | null> {
		if (deps.pinnedVersion) {
			return deps.pinnedVersion;
		}

		if (!deps.latestReleaseUrl) {
			return null;
		}

		if (cached && now() - cached.at < LATEST_TTL_MS) {
			return cached.version;
		}

		try {
			const version = await resolveLatest(deps.latestReleaseUrl);

			if (version) {
				cached = { version, at: now() };
			}

			// A failed lookup falls through to the last good answer rather than to
			// nothing, so a brief outage at the release host does not make every
			// machine look up to date.
			return version ?? cached?.version ?? null;
		} catch {
			return cached?.version ?? null;
		}
	}

	return {
		currentVersion,

		downloadBaseFor(version: string): string {
			return resolveDownloadBase({ baseUrl: deps.downloadBaseUrl, version });
		},

		// Not a semver comparison: "different from what we publish" is the useful
		// question, and it is what lets a downgrade roll a fleet back by pinning
		// AGENT_EXPECTED_VERSION rather than needing a new release above the bad one.
		misconfigured: canNameVersion
			? null
			: `AGENT_DOWNLOAD_BASE_URL has no ${VERSION_PLACEHOLDER} in it, so a machine cannot be sent a specific build — no upgrade will be offered`,

		async target(
			reported: string | null
		): Promise<{ version: string; downloadBaseUrl: string } | null> {
			if (!canNameVersion) {
				return null;
			}

			const version = await currentVersion();

			if (version === null || reported === null || reported === version) {
				return null;
			}

			return { version, downloadBaseUrl: this.downloadBaseFor(version) };
		}
	};
}

export type AgentReleaseService = ReturnType<typeof getAgentReleaseService>;
