import { z } from 'zod';
import { type EnvService } from './env.service';
import { type ExecService } from './exec.service';

export const CLAUDE_TOKEN_VARIABLE = 'CLAUDE_CODE_OAUTH_TOKEN';

// Claude Code applies its own precedence between this and the token, so a stray
// key left on the box could otherwise decide which account a session bills to.
// Stripped from every session rather than merely ignored here.
export const CONFLICTING_VARIABLES = ['ANTHROPIC_API_KEY'];

const AuthStatusSchema = z.object({ loggedIn: z.boolean(), authMethod: z.string().optional() });

// A real turn against the API. `claude auth status` reports only that a
// credential is *present* — it answers `loggedIn: true` for a token the API will
// reject — so proving a credential works means actually using it.
const VerifyResultSchema = z.object({
	is_error: z.boolean().optional(),
	api_error_status: z.number().optional(),
	result: z.string().optional()
});

const VERIFY_TIMEOUT_MS = 60_000;

export interface ClaudeAuthStatus {
	// Whether a report was read at all, as distinct from what it said. "Not logged
	// in" is an answer; "no answer" is a broken command, and the two need different
	// things done about them.
	reported: boolean;
	loggedIn: boolean;
	detail: string;
}

function safeJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
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
		// Deliberately not "authenticated": this only establishes that a credential
		// is configured. Whether the API accepts it is what `bosun-agent auth status`
		// answers, and what the first planning session finds out.
		return {
			reported: true,
			loggedIn: true,
			detail: `credential present (${parsed.data.authMethod ?? 'unknown method'})`
		};
	}

	return {
		reported: true,
		loggedIn: false,
		detail: opts.tokenPresent
			? `${CLAUDE_TOKEN_VARIABLE} was refused — it may have expired; re-run \`claude setup-token\` and update ~/.bosun/env`
			: `no ${CLAUDE_TOKEN_VARIABLE} in ~/.bosun/env — run \`claude setup-token\` on your own machine and put the token there`
	};
}

export interface VerifyResult {
	ok: boolean;
	detail: string;
}

// The whole point of this check is that it runs on a box the operator cannot
// see, so a verdict of "no readable result" with nothing else is the one outcome
// they can do nothing with. What claude actually printed is quoted instead.
function quoteOutput(opts: { stdout: string; stderr: string }): string {
	const said = [
		opts.stdout ? `stdout: ${opts.stdout.slice(0, 200)}` : '',
		opts.stderr ? `stderr: ${opts.stderr.slice(0, 200)}` : ''
	].filter(Boolean);

	return said.length === 0
		? 'claude exited cleanly and printed nothing at all — check `claude --version` on this machine'
		: `claude produced no JSON result — ${said.join(' | ')}`;
}

export function readVerifyResult(opts: {
	raw: string;
	reason: string;
	stderr?: string;
}): VerifyResult {
	const start = opts.raw.indexOf('{');
	const parsed =
		start === -1 ? null : VerifyResultSchema.safeParse(safeJson(opts.raw.slice(start)));

	if (!parsed?.success) {
		return {
			ok: false,
			detail: opts.reason || quoteOutput({ stdout: opts.raw, stderr: opts.stderr ?? '' })
		};
	}

	if (parsed.data.is_error !== true) {
		return { ok: true, detail: 'the API accepted this credential' };
	}

	return {
		ok: false,
		detail: parsed.data.result ?? `the API refused it (${parsed.data.api_error_status ?? 'error'})`
	};
}

export function getClaudeAuthService(deps: { exec: ExecService; env: EnvService }) {
	function readToken(): string | null {
		return deps.env.current()[CLAUDE_TOKEN_VARIABLE] || null;
	}

	return {
		readToken,

		async readStatus(): Promise<ClaudeAuthStatus> {
			// Run against the freshly read environment, so a credential pasted into
			// ~/.bosun/env since the agent started is the one being verified.
			const result = await deps.exec.run('claude', ['auth', 'status', '--json'], {
				env: deps.env.current()
			});

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

		// Costs one tiny turn, which is why it is not part of preflight: this runs
		// when somebody sets a credential or asks, not on every reconnect.
		async verify(opts?: { token?: string }): Promise<VerifyResult> {
			const env = deps.env.current();
			const result = await deps.exec.run(
				'claude',
				['--print', '--tools=', '--output-format', 'json', 'ok'],
				{
					env: opts?.token ? { ...env, [CLAUDE_TOKEN_VARIABLE]: opts.token } : env,
					timeoutMs: VERIFY_TIMEOUT_MS
				}
			);

			return readVerifyResult({
				raw: result.stdout,
				reason: result.reason,
				stderr: result.stderr
			});
		},

		// At most one credential reaches the session, so the box authenticates as the
		// account bosun checked at preflight rather than whichever variable the CLI
		// happens to prefer.
		sessionEnv(): NodeJS.ProcessEnv {
			const env: NodeJS.ProcessEnv = deps.env.current();

			for (const variable of CONFLICTING_VARIABLES) {
				delete env[variable];
			}

			return env;
		}
	};
}

export type ClaudeAuthService = ReturnType<typeof getClaudeAuthService>;
