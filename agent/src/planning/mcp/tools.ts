import { z } from 'zod';
import { ASK_DEFINITION } from '../../sessions/ask';
import {
	createAskTool,
	textToolResult,
	type PendingQuestion
} from '../../sessions/mcp-server';
import { type PlanQuestion } from '../../protocol';
import { type BosunApiService } from '../../services/bosun-api.service';

export const CreatePlanArgsSchema = z.object({
	title: z.string().min(1),
	bodyMd: z.string().min(1)
});

export const AddAcArgsSchema = z.object({ code: z.string().min(1), text: z.string().min(1) });

export const SetBlockersArgsSchema = z.object({
	blockedByNumbers: z.array(z.number().int().positive())
});

export const CreateSliceArgsSchema = z.object({
	ordinal: z.number().int().min(1),
	kind: z.enum(['build', 'verify']),
	title: z.string().min(1),
	bodyMd: z.string().optional(),
	acCodes: z.array(z.string().min(1))
});

const DESCRIPTIONS: Record<string, string> = {
	list_plans:
		'List every plan already written for this machine — number, title, status, its tracer bullets and what it is blocked by. Call this during recon, before you write anything: it is the only way to see whether the work you are planning is already covered, already underway, or waiting on something. Bodies are truncated to a summary.',
	set_blockers:
		'Declare which plans this one cannot start until. Names them by plan number, replacing whatever was declared before — pass an empty list to clear. A queue runs plans in push order except where a blocker says otherwise, so this is what stops a plan executing before the work it depends on exists.',
	create_plan:
		'Publish the plan title and its markdown body. Call this once, before add_ac, and only after every question is resolved.',
	add_ac:
		'Add one acceptance criterion. Codes are AC-1, AC-2, ... in order. Every AC must later be claimed by exactly one tracer bullet.',
	create_slice:
		'Create one tracer bullet and claim the acceptance criteria it delivers. acCodes must name ACs that exist and that no other bullet has claimed.'
};

export const TOOL_SCHEMAS = {
	list_plans: z.object({}),
	set_blockers: SetBlockersArgsSchema,
	create_plan: CreatePlanArgsSchema,
	add_ac: AddAcArgsSchema,
	create_slice: CreateSliceArgsSchema
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
	bosunApi: BosunApiService;
	onQuestion: (payload: { questionId: string; questions: PlanQuestion[] }) => void;
}) {
	return function build(pending: Map<string, PendingQuestion>) {
		const ask = createAskTool({ pending, onQuestion: opts.onQuestion });

		return async function dispatch(name: string, args: unknown) {
			if (name === 'bosun_ask') {
				return ask(args);
			}

			if (name === 'list_plans') {
				return textToolResult(JSON.stringify(await opts.bosunApi.listMachinePlans()));
			}

			if (name === 'set_blockers') {
				const saved = await opts.bosunApi.setPlanBlockers({
					planId: opts.planId,
					...SetBlockersArgsSchema.parse(args)
				});

				return textToolResult(JSON.stringify(saved));
			}

			if (name === 'create_plan') {
				await opts.bosunApi.savePlanTitle({
					planId: opts.planId,
					...CreatePlanArgsSchema.parse(args)
				});

				return textToolResult(opts.planId);
			}

			if (name === 'add_ac') {
				const created = await opts.bosunApi.addPlanAc({
					planId: opts.planId,
					...AddAcArgsSchema.parse(args)
				});

				return textToolResult(JSON.stringify(created));
			}

			if (name === 'create_slice') {
				const created = await opts.bosunApi.createPlanSlice({
					planId: opts.planId,
					slice: CreateSliceArgsSchema.parse(args)
				});

				return textToolResult(JSON.stringify(created));
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
