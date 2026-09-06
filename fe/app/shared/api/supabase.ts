import { createClient } from '@supabase/supabase-js'

// The whole session lifecycle — storage and silent refresh before expiry —
// belongs to this client. Nothing else in the app reads or writes a token.
export const supabase = createClient(
	import.meta.env.VITE_SUPABASE_URL,
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
	{
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: false
		}
	}
)
