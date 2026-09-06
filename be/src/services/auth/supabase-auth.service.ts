import { createClient } from '@supabase/supabase-js';

// The statuses on which Supabase has given a verdict on the token itself. Every
// other outcome — a 5xx, a network error, a throw — is our problem, not the
// caller's, and must never be reported back as a bad token.
const REJECTED_STATUSES = new Set([400, 401, 403, 404, 422]);

// Neither supabase-js nor Node's fetch imposes a deadline, so a stalled auth
// service would otherwise hold every request open until the client gives up.
const AUTH_TIMEOUT_MS = 5_000;

export type ResolvedToken =
	| { status: 'ok'; subId: string; email: string }
	| { status: 'rejected' }
	| { status: 'unavailable' };

export function getSupabaseAuth(opts: { url: string; publishableKey: string }) {
	const client = createClient(opts.url, opts.publishableKey, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) =>
				fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) })
		}
	});

	return {
		async resolveToken(jwt: string): Promise<ResolvedToken> {
			try {
				const { data, error } = await client.auth.getUser(jwt);

				if (error) {
					return REJECTED_STATUSES.has(error.status ?? 0)
						? { status: 'rejected' }
						: { status: 'unavailable' };
				}

				// An account with no email cannot be provisioned into `users`, so
				// it gets no access rather than a half-built row.
				if (!data.user.email) {
					return { status: 'rejected' };
				}

				return { status: 'ok', subId: data.user.id, email: data.user.email };
			} catch {
				return { status: 'unavailable' };
			}
		}
	};
}

export type SupabaseAuth = ReturnType<typeof getSupabaseAuth>;
