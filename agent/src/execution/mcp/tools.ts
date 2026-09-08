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
export const RecordDecisionArgsSchema = z.object({
	fork: z.string().min(1),
	options: z.string().nullable().optional(),
	chose: z.string().min(1),
	blastRadius: z.string().nullable().optional(),
	reversing: z.string().nullable().optional()
});

const RECORD_DECISION_DEFINITION = {
	name: 'record_decision',
	description:
		'Record a fork the plan left open and how you resolved it. Goes on the plan, is shown in the browser as it lands, and is carried into the pull request verbatim. Required for: a new shared module, a new table or column or migration, a new endpoint or a changed request/response shape, a new dependency, a change spanning more than five files, an acceptance criterion that turns out unbuildable or already true, or a choice between two viable implementations the plan named neither of.',
	inputSchema: z.toJSONSchema(RecordDecisionArgsSchema, { target: 'draft-7' })
};

export function executionDefinitions(afk: boolean): unknown[] {
	const always = [LIST_PLANS_DEFINITION, RECORD_DECISION_DEFINITION];

	return afk ? always : [ASK_DEFINITION, ...always];
}

export function executionMcpTools(afk: boolean): string[] {
	const always = ['mcp__bosun__list_plans', 'mcp__bosun__record_decision'];

	return afk ? always : ['mcp__bosun__bosun_ask', ...always];
}

export function createExecutionDispatch(opts: {
	afk: boolean;
	planId: string;
	sliceId: string;
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

			if (name === 'record_decision') {
				const parsed = RecordDecisionArgsSchema.parse(args);

				return textToolResult(
					JSON.stringify(
						await opts.bosunApi.recordPlanDecision({
							planId: opts.planId,
							sliceId: opts.sliceId,
							fork: parsed.fork,
							options: parsed.options ?? null,
							chose: parsed.chose,
							blastRadius: parsed.blastRadius ?? null,
							reversing: parsed.reversing ?? null
						})
					)
				);
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
