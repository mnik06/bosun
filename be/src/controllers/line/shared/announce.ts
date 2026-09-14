import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Build } from 'src/types/BuildSchema';

// A build moving changes the board, the plan page and the needs-you count at once,
// so all three hear about it. The two nudges are cheap and the browser refetches
// only what it has open.
export function announceBuild(opts: { socketRegistry: SocketRegistry; projectId: string; build: Build }): void {
	opts.socketRegistry.broadcastToUi({
		projectId: opts.projectId,
		message: { type: 'build.updated', build: opts.build }
	});
	opts.socketRegistry.broadcastToUi({
		projectId: opts.projectId,
		message: { type: 'line.changed', repositoryId: opts.build.repositoryId }
	});
	opts.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'needs_you.changed' } });
}

export function announcePlanChanged(opts: { socketRegistry: SocketRegistry; projectId: string; planId: string }): void {
	opts.socketRegistry.broadcastToUi({
		projectId: opts.projectId,
		message: { type: 'plan.changed', planId: opts.planId }
	});
}

export function announceNeedsYou(opts: { socketRegistry: SocketRegistry; projectId: string }): void {
	opts.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'needs_you.changed' } });
}
