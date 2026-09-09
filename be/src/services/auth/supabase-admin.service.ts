import { createClient } from '@supabase/supabase-js';

const ADMIN_TIMEOUT_MS = 10_000;

export type CreatedAccount =
	| { status: 'created'; subId: string }
	| { status: 'exists' }
	| { status: 'rejected'; message: string }
	| { status: 'unavailable' };

// Deliberately separate from `supabase-auth.service`: this client holds the
// secret key, which can mint, modify and delete any account in the project, and
// the token-resolution path has no business being able to reach it. Nothing but
// account creation is exposed here — a wider surface is a wider blast radius for
// the same stolen key.
export function getSupabaseAdmin(opts: { url: string; secretKey: string }) {
	const client = createClient(opts.url, opts.secretKey, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) =>
				fetch(input, { ...init, signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS) })
		}
	});

	return {
		// `email_confirm: true` because there is no mail in this product: a member
		// who had to click a link nobody sent them could never sign in.
		async createUser(account: { email: string; password: string }): Promise<CreatedAccount> {
			try {
				const { data, error } = await client.auth.admin.createUser({
					email: account.email,
					password: account.password,
					email_confirm: true
				});

				if (error) {
					if (error.status === 422) {
						return { status: 'exists' };
					}

					return error.status && error.status < 500
						? { status: 'rejected', message: error.message }
						: { status: 'unavailable' };
				}

				return { status: 'created', subId: data.user.id };
			} catch {
				return { status: 'unavailable' };
			}
		}
	};
}

export type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;
