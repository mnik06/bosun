import { z } from 'zod';
import { type ExecService } from './exec.service';

export const CLAUDE_TOKEN_VARIABLE = 'CLAUDE_CODE_OAUTH_TOKEN';

// Claude Code applies its own precedence between this and the token, so a stray
// key left on the box could otherwise decide which account a session bills to.
// Stripped from every session rather than merely ignored here.
export const CONFLICTING_VARIABLES = ['ANTHROPIC_API_KEY'];

const AuthStatusSchema = z.object({ loggedIn: z.boolean() });

export interface ClaudeAuthStatus {
	// Whether a report was read at all, as distinct from what it said. "Not logged
	// in" is an answer; "no answer" is a broken command, and the two need different
	// things done about them.
	reported: boolean;
	loggedIn: boolean;
	detail: string;
}

// The CLI may print a notice before its JSON, so the object is located rather
// than assumed to start at the first byte.
function readJson(raw: string): unknown {
	const start = raw.indexOf('{');

	if (start === -1) {
		return null;
	}

	try {
		return JSON.parse(raw.slice(start));
	} catch {
		return null;
	}
}

// A token that is present but refused is an expired or revoked token, and the fix
// for that is minting a new one — a different instruction from "no token here at
// all". Reported apart because a box that looks configured and still fails is
// where an operator otherwise stops looking.
export function readClaudeAuthStatus(opts: { raw: string; tokenPresent: boolean }): ClaudeAuthStatus {
	// Parsed defensively rather than with a bare JSON.parse: this runs inside
	// `Promise.all` over every preflight check, so a throw here would take the
	// whole report down and the machine would report nothing at all.
	const parsed = AuthStatusSchema.safeParse(readJson(opts.raw));

	if (!parsed.success) {
		return { reported: false, loggedIn: false, detail: 'could not read `claude auth status`' };
	}

	if (parsed.data.loggedIn) {
		return { reported: true, loggedIn: true, detail: 'authenticated' };
	}

	return {
		reported: true,
		loggedIn: false,
		detail: opts.tokenPresent
			? `${CLAUDE_TOKEN_VARIABLE} was refused — it may have expired; re-run \`claude setup-token\` and update ~/.bosun/env`
			: `no ${CLAUDE_TOKEN_VARIABLE} in ~/.bosun/env — run \`claude setup-token\` on your own machine and put the token there`
	};
}

export function getClaudeAuthService(deps: { exec: ExecService; env: NodeJS.ProcessEnv }) {
	function readToken(): string | null {
		return deps.env[CLAUDE_TOKEN_VARIABLE] || null;
	}

	return {
		readToken,

		async readStatus(): Promise<ClaudeAuthStatus> {
			const result = await deps.exec.run('claude', ['auth', 'status', '--json']);

			// The exit status is not the answer — the JSON is. `auth status` is read
			// whenever it produced one, so a non-zero exit alongside a usable report is
			// not turned into an unexplained failure.
			const status = readClaudeAuthStatus({
				raw: result.stdout,
				tokenPresent: readToken() !== null
			});

			if (!status.reported) {
				return { ...status, detail: `claude auth status: ${result.reason}` };
			}

			return status;
		},

		// At most one credential reaches the session, so the box authenticates as the
		// account bosun checked at preflight rather than whichever variable the CLI
		// happens to prefer.
		sessionEnv(): NodeJS.ProcessEnv {
			const env: NodeJS.ProcessEnv = { ...deps.env };

			for (const variable of CONFLICTING_VARIABLES) {
				delete env[variable];
			}

			return env;
		}
	};
}

export type ClaudeAuthService = ReturnType<typeof getClaudeAuthService>;
