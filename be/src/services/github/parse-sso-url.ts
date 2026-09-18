// `X-GitHub-SSO` looks like `required; url=https://github.com/orgs/acme/sso?...` —
// present only when the organization enforces SAML SSO and a token was never
// authorized for it. Shared by every GitHub-calling service so a break noticed
// on any call path surfaces the same authorization link.
export function parseSsoUrl(header: string | null): string | null {
	if (header === null) {
		return null;
	}

	const match = /url=(\S+)/.exec(header);

	return match?.[1] ?? null;
}
