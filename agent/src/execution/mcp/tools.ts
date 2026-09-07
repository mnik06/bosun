import { ASK_DEFINITION } from '../../sessions/ask';
import { createAskTool, type PendingQuestion } from '../../sessions/mcp-server';
import { type PlanQuestion } from '../../protocol';

// An AFK queue is given no way to ask at all, rather than a tool it is told not
// to call. A model that can see `bosun_ask` in its tool list will eventually
// reach for it, and on an unattended queue that is a session blocked forever.
export function executionDefinitions(afk: boolean): unknown[] {
	return afk ? [] : [ASK_DEFINITION];
}

export function executionMcpTools(afk: boolean): string[] {
	return afk ? [] : ['mcp__bosun__bosun_ask'];
}

export function createExecutionDispatch(opts: {
	afk: boolean;
	onQuestion: (payload: { questionId: string; questions: PlanQuestion[] }) => void;
}) {
	return function build(pending: Map<string, PendingQuestion>) {
		const ask = createAskTool({ pending, onQuestion: opts.onQuestion });

		return async function dispatch(name: string, args: unknown) {
			if (name === 'bosun_ask' && !opts.afk) {
				return ask(args);
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
