const VERSION_PLACEHOLDER = '{version}';

// A base pointing at `releases/latest` cannot express "this exact build", so a
// bad release could not be rolled back by changing configuration — every machine
// would keep fetching whatever `latest` had become. A `{version}` placeholder
// makes the download and the version bosun asked for the same thing.
export function resolveDownloadBase(opts: { baseUrl: string; version: string }): string {
	return opts.baseUrl.replaceAll(VERSION_PLACEHOLDER, opts.version);
}

export function getAgentReleaseService(deps: { version: string; downloadBaseUrl: string }) {
	return {
		version: deps.version,

		downloadBaseUrl: resolveDownloadBase({
			baseUrl: deps.downloadBaseUrl,
			version: deps.version
		}),

		// Not a semver comparison: "different from what we publish" is the useful
		// question, and it is what lets a downgrade roll a fleet back by lowering
		// AGENT_EXPECTED_VERSION rather than needing a new release above the bad one.
		isOutdated(reported: string | null): boolean {
			return reported !== null && reported !== deps.version;
		}
	};
}

export type AgentReleaseService = ReturnType<typeof getAgentReleaseService>;
