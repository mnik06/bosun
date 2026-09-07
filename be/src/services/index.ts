import { getSupabaseAuth } from 'src/services/auth/supabase-auth.service';
import { getIdService } from 'src/services/ids/id.service';
import { getInstallerService } from 'src/services/installer/installer.service';
import { getKeyService } from 'src/services/keys/key.service';
import { getPlanTextService } from 'src/services/plans/plan-text.service';
import { getPendingPingsService } from 'src/services/sockets/pending-pings.service';
import { getSocketRegistry } from 'src/services/sockets/registry.service';
import { getTicketService } from 'src/services/tickets/ticket.service';
import { type Env } from 'src/types/EnvSchema';

export function getServices(opts: { env: Env }) {
	const keyService = getKeyService();

	return {
		idService: getIdService(),
		installerService: getInstallerService(),
		keyService,
		pendingPings: getPendingPingsService(),
		planTextService: getPlanTextService(),
		socketRegistry: getSocketRegistry(),
		supabaseAuth: getSupabaseAuth({
			url: opts.env.SUPABASE_URL,
			publishableKey: opts.env.SUPABASE_PUBLISHABLE_KEY
		}),
		ticketService: getTicketService({ keyService })
	};
}

export type Services = ReturnType<typeof getServices>;
