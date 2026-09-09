import { z } from 'zod';
import { ASK_DEFINITION } from '../../sessions/ask';
import {
	createAskTool,
	textToolResult,
	type PendingQuestion
} from '../../sessions/mcp-server';
import { type PlanAnswer, type PlanQuestion } from '../../protocol';
import { type BosunApiService } from '../../services/bosun-api.service';

export const NamePlanArgsSchema = z.object({ title: z.string().min(1) });

export const SetBlockersArgsSchema = z.object({
	blockedByNumbers: z.array(z.number().int().positive())
});

export const PublishPlanArgsSchema = z.object({
	title: z.string().min(1),
	bodyMd: z.string().min(1),
	acs: z.array(z.object({ code: z.string().min(1), text: z.string().min(1) })).min(1),
	slices: z
		.array(
			z.object({
				ordinal: z.number().int().min(1),
				kind: z.enum(['build', 'verify']),
				title: z.string().min(1),
				bodyMd: z.string().nullable().optional(),
				acCodes: z.array(z.string().min(1))
			})
		)
		.min(1)
});

const DESCRIPTIONS: Record<string, string> = {
	list_plans:
		'List every plan already written for this machine — number, title, status, its tracer bullets and what it is blocked by. Call this during recon, before you write anything: it is the only way to see whether the work you are planning is already covered, already underway, or waiting on something. Bodies are truncated to a summary.',
	name_plan:
		'Name this plan. Call it as soon as you know what the ticket is about, before the grill starts — until you do, the person watching a list of running sessions sees "Untitled". Call it again if the scope turns out to be something else.',
	set_blockers:
		'Declare which plans this one cannot start until. Names them by plan number, replacing whatever was declared before — pass an empty list to clear. A queue runs plans in push order except where a blocker says otherwise, so this is what stops a plan executing before the work it depends on exists.',
	publish_plan:
		'Publish the whole plan at once: title, markdown body, every acceptance criterion and every tracer bullet with the criteria it claims. Replaces whatever was published before, so a revision re-sends the plan as it should now be rather than a diff. Every AC must be claimed by exactly one bullet, and what is already marked implemented or verified stays that way.'
};

export const TOOL_SCHEMAS = {
	list_plans: z.object({}),
	name_plan: NamePlanArgsSchema,
	set_blockers: SetBlockersArgsSchema,
	publish_plan: PublishPlanArgsSchema
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

// Derived from the Zod schemas rather than written out beside them. Hand-keeping
// two declarations of the same shape in sync is a drift the model only discovers
// by calling a tool with arguments the parser then rejects.
export const TOOL_DEFINITIONS = [
	ASK_DEFINITION,
	...Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
		name,
		description: DESCRIPTIONS[name]!,
		inputSchema: z.toJSONSchema(schema, { target: 'draft-7' })
	}))
];

export function createPlanDispatch(opts: {
	planId: string;
	auto: boolean;
	bosunApi: BosunApiService;
	onQuestion: (payload: {
		questionId: string;
		questions: PlanQuestion[];
		autoAnswers?: PlanAnswer[];
	}) => void;
}) {
	return function build(pending: Map<string, PendingQuestion>) {
		const ask = createAskTool({ pending, onQuestion: opts.onQuestion, auto: opts.auto });

		return async function dispatch(name: string, args: unknown) {
			if (name === 'bosun_ask') {
				return ask(args);
			}

			if (name === 'list_plans') {
				return textToolResult(JSON.stringify(await opts.bosunApi.listMachinePlans()));
			}

			if (name === 'name_plan') {
				await opts.bosunApi.savePlanName({
					planId: opts.planId,
					...NamePlanArgsSchema.parse(args)
				});

				return textToolResult(opts.planId);
			}

			if (name === 'set_blockers') {
				const saved = await opts.bosunApi.setPlanBlockers({
					planId: opts.planId,
					...SetBlockersArgsSchema.parse(args)
				});

				return textToolResult(JSON.stringify(saved));
			}

			if (name === 'publish_plan') {
				const saved = await opts.bosunApi.publishPlan({
					planId: opts.planId,
					artifact: PublishPlanArgsSchema.parse(args)
				});

				return textToolResult(JSON.stringify(saved));
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
