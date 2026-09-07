import { type ClaudeAuthMode } from './protocol';

// Ordered, and the order is the contract: the agent puts exactly one of these
// into the session's environment and strips the other, so the mode reported at
// preflight is the mode the session actually authenticates with. Claude Code
// resolves its own precedence when both are present, and that resolution is not
// something bosun can report on.
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
