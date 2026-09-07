import { z } from 'zod';
import { ASK_DEFINITION } from '../../sessions/ask';
import { createAskTool, textToolResult, type PendingQuestion } from '../../sessions/mcp-server';
import { type PlanQuestion } from '../../protocol';
import { type BosunApiService } from '../../services/bosun-api.service';

// The same view planning had. A bullet is executed with only its own plan in
// front of it, so when it hits something a sibling plan owns, this is how it
// finds out rather than guessing or building it twice.
const LIST_PLANS_DEFINITION = {
	name: 'list_plans',
	description:
		'List every plan written for this machine — number, title, status, its tracer bullets and what it is blocked by. Use it when your bullet touches something you suspect another plan owns, so you can leave that work to it rather than duplicating or pre-empting it.',
	inputSchema: z.toJSONSchema(z.object({}), { target: 'draft-7' })
};

// An AFK queue is given no way to ask at all, rather than a tool it is told not
// to call. A model that can see `bosun_ask` in its tool list will eventually
// reach for it, and on an unattended queue that is a session blocked forever.
export function executionDefinitions(afk: boolean): unknown[] {
	return afk ? [LIST_PLANS_DEFINITION] : [ASK_DEFINITION, LIST_PLANS_DEFINITION];
}

export function executionMcpTools(afk: boolean): string[] {
	const listing = 'mcp__bosun__list_plans';

	return afk ? [listing] : ['mcp__bosun__bosun_ask', listing];
}

export function createExecutionDispatch(opts: {
	afk: boolean;
	bosunApi: BosunApiService;
	onQuestion: (payload: { questionId: string; questions: PlanQuestion[] }) => void;
}) {
	return function build(pending: Map<string, PendingQuestion>) {
		const ask = createAskTool({ pending, onQuestion: opts.onQuestion });

		return async function dispatch(name: string, args: unknown) {
			if (name === 'bosun_ask' && !opts.afk) {
				return ask(args);
			}

			if (name === 'list_plans') {
				return textToolResult(JSON.stringify(await opts.bosunApi.listMachinePlans()));
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
