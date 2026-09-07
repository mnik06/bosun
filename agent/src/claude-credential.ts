import { z } from 'zod';
import { type ClaudeAuthMode } from './protocol';

// Only these two are injected into a session. They are not the only way a box can
// be authenticated — `claude` also has its own credential store, which is what a
// machine set up with `claude auth login` uses — so their absence is not the same
// as having no credential. `readClaudeAuthStatus` is what decides that.
const SUPPORTED: { variable: string; mode: ClaudeAuthMode }[] = [
	{ variable: 'CLAUDE_CODE_OAUTH_TOKEN', mode: 'oauth' },
	{ variable: 'ANTHROPIC_API_KEY', mode: 'api-key' }
];

export const SUPPORTED_CREDENTIAL_VARIABLES = SUPPORTED.map((entry) => entry.variable);

export interface ClaudeCredential {
	variable: string;
	mode: ClaudeAuthMode;
	value: string;
}

export function resolveClaudeCredential(env: NodeJS.ProcessEnv): ClaudeCredential | null {
	for (const entry of SUPPORTED) {
		const value = env[entry.variable];

		if (value) {
			return { variable: entry.variable, mode: entry.mode, value };
		}
	}

	return null;
}

const AuthStatusSchema = z.object({
	loggedIn: z.boolean(),
	authMethod: z.string().optional(),
	apiKeySource: z.string().optional(),
	subscriptionType: z.string().nullish()
});

export interface ClaudeAuthStatus {
	loggedIn: boolean;
	mode: ClaudeAuthMode | null;
	detail: string;
}

// Asked rather than inferred. Which credential wins between an environment
// variable and the CLI's own store is the CLI's decision, and a machine that is
// logged in through `claude auth login` is authenticated just as completely as
// one holding a token in `~/.bosun/env`.
export function readClaudeAuthStatus(raw: string): ClaudeAuthStatus {
	const parsed = AuthStatusSchema.safeParse(JSON.parse(raw));

	if (!parsed.success) {
		return { loggedIn: false, mode: null, detail: 'could not read `claude auth status`' };
	}

	const status = parsed.data;

	if (!status.loggedIn) {
		return {
			loggedIn: false,
			mode: null,
			detail: 'claude is not logged in — run `claude auth login`, or set a credential in ~/.bosun/env'
		};
	}

	if (status.apiKeySource) {
		return { loggedIn: true, mode: 'api-key', detail: `api key via ${status.apiKeySource}` };
	}

	if (status.authMethod === 'oauth_token') {
		return { loggedIn: true, mode: 'oauth', detail: 'oauth token from the service environment' };
	}

	return {
		loggedIn: true,
		mode: 'subscription',
		detail: status.subscriptionType
			? `${status.authMethod ?? 'claude.ai'} (${status.subscriptionType})`
			: (status.authMethod ?? 'claude.ai')
	};
}
