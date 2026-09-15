import { z } from 'zod';
import { mcpToolDefinition, textToolResult, type PendingQuestion } from '../../sessions/mcp-server';

export const GiveUpArgsSchema = z.object({
	reason: z.string().min(1).describe('what you could not reconcile, naming the files and the two intents that collide')
});

export const CONFLICT_DEFINITIONS = [
	mcpToolDefinition({
		name: 'give_up',
		description:
			'Stop without resolving: the two sides cannot both hold, or resolving would mean deciding something only a person can. The integration is abandoned, the branch is left as it was, and your reason goes to the person who has to decide. Call it instead of guessing.',
		schema: GiveUpArgsSchema
	})
];

export const CONFLICT_MCP_TOOLS = ['mcp__bosun__give_up'];

export function createConflictDispatch(opts: { onGiveUp: (reason: string) => void }) {
	return function build(_pending: Map<string, PendingQuestion>) {
		return async function dispatch(name: string, args: unknown) {
			if (name === 'give_up') {
				opts.onGiveUp(GiveUpArgsSchema.parse(args).reason);

				return textToolResult('Recorded. End your turn now without changing anything else.');
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
