import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type BugfixMessage } from 'src/types/BugfixSchema';

// A build's bug-fixing chat has no subscription of its own — it rides the
// plan's existing `plan.subscribe` channel, since every socket watching a
// build's plan is already watching the one build it can have live at a time.
export function announceBugfixMessage(opts: { socketRegistry: SocketRegistry; planId: string; message: BugfixMessage }): void {
	opts.socketRegistry.broadcastToPlan({
		planId: opts.planId,
		message: { type: 'bugfix.message', buildId: opts.message.buildId, message: opts.message }
	});
}
