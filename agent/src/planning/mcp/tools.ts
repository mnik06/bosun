import { z } from 'zod';
import { ASK_DEFINITION } from '../../sessions/ask';
import {
	createAskTool,
	textToolResult,
	type PendingQuestion
} from '../../sessions/mcp-server';
import { type PlanAnswer, type PlanQuestion, type PreparePlan } from '../../protocol';
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

export const RepublishPlanArgsSchema = PublishPlanArgsSchema.extend({
	planNumber: z.number().int().positive()
});

export const SetPlanBlockersArgsSchema = SetBlockersArgsSchema.extend({
	planNumber: z.number().int().positive()
});

export const AbandonPreparationArgsSchema = z.object({ reason: z.string().min(1) });

const DESCRIPTIONS: Record<string, string> = {
	list_plans:
		'List every plan already written for this machine — number, title, status, its tracer bullets and what it is blocked by. Call this during recon, before you write anything: it is the only way to see whether the work you are planning is already covered, already underway, or waiting on something. Bodies are truncated to a summary.',
	name_plan:
		'Name this plan. Call it as soon as you know what the ticket is about, before the grill starts — until you do, the person watching a list of running sessions sees "Untitled". Call it again if the scope turns out to be something else.',
	set_blockers:
		'Declare which plans this one cannot start until. Names them by plan number, replacing whatever was declared before — pass an empty list to clear. A queue runs plans in push order except where a blocker says otherwise, so this is what stops a plan executing before the work it depends on exists.',
	publish_plan:
		'Publish the whole plan at once: title, markdown body, every acceptance criterion and every tracer bullet with the criteria it claims. Replaces whatever was published before, so a revision re-sends the plan as it should now be rather than a diff. Every AC must be claimed by exactly one bullet, and what is already marked implemented or verified stays that way.',
	republish_plan:
		'Rewrite one of the plans this preparation was created for, named by its number. Same shape as publish_plan plus the number, and it replaces that plan wholesale — anything left out is deleted. Only the plans in this preparation can be rewritten; any other number is refused. It clears that plan\'s sign-off, which is intended: it is not the plan the person read.',
	set_plan_blockers:
		'Declare what one of the selected plans waits on, named by its number, with the blockers named by number too. Replaces that plan\'s list wholesale, so it must carry the blockers it already had as well as this preparation plan. Call it last, after every republish: a run that stops half way should leave plans unblocked rather than blocked and still describing work somebody else now owns.',
	abandon_preparation:
		'End this preparation without writing a plan, with the reason. Call it when the selected plans turn out to share nothing worth building once — an empty preparation plan is a merge everybody waits for.'
};

export const TOOL_SCHEMAS = {
	list_plans: z.object({}),
	name_plan: NamePlanArgsSchema,
	set_blockers: SetBlockersArgsSchema,
	publish_plan: PublishPlanArgsSchema
} as const;

// A preparation session writes its own plan and rewrites the ones it was created
// for, so it trades `set_blockers` — which only ever names its own plan — for the
// three tools that act on another.
export const PREPARE_TOOL_SCHEMAS = {
	list_plans: z.object({}),
	name_plan: NamePlanArgsSchema,
	publish_plan: PublishPlanArgsSchema,
	republish_plan: RepublishPlanArgsSchema,
	set_plan_blockers: SetPlanBlockersArgsSchema,
	abandon_preparation: AbandonPreparationArgsSchema
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

// Derived from the Zod schemas rather than written out beside them. Hand-keeping
// two declarations of the same shape in sync is a drift the model only discovers
// by calling a tool with arguments the parser then rejects.
function definitionsFor(schemas: Record<string, z.ZodType>) {
	return [
		ASK_DEFINITION,
		...Object.entries(schemas).map(([name, schema]) => ({
			name,
			description: DESCRIPTIONS[name]!,
			inputSchema: z.toJSONSchema(schema, { target: 'draft-7' })
		}))
	];
}

export const TOOL_DEFINITIONS = definitionsFor(TOOL_SCHEMAS);

export const PREPARE_TOOL_DEFINITIONS = definitionsFor(PREPARE_TOOL_SCHEMAS);

// The one thing a session cannot be trusted to enforce on itself. A turn that
// runs long, loses the thread and writes the plan it already had in mind is the
// failure this catches: the person is grilled precisely because the plan is not
// supposed to be the model's own first draft. Auto mode is exempt because its
// answers are the model's own by design, and a revision is exempt because the
// plan it is editing was already grilled into existence.
const GRILL_REQUIRED = [
	'Refused: this plan has not been grilled yet, so there is nothing to publish.',
	'Not one `bosun_ask` question has been put to the person and answered.',
	'Run the grill — one question at a time, with `bosun_ask` — and publish once the decisions are settled.'
].join(' ');

export function createPlanDispatch(opts: {
	planId: string;
	auto: boolean;
	// Off for a revision: the plan handed to it is already the product of a grill,
	// and a change the person asked for in prose is not a new one.
	requireGrill: boolean;
	bosunApi: BosunApiService;
	onPublished: () => void;
	onGrilled: () => void;
	onQuestion: (payload: {
		questionId: string;
		questions: PlanQuestion[];
		autoAnswers?: PlanAnswer[];
	}) => void;
}) {
	return function build(pending: Map<string, PendingQuestion>) {
		let grilled = false;
		const ask = createAskTool({
			pending,
			onQuestion: opts.onQuestion,
			auto: opts.auto,
			onAnswered: () => {
				grilled = true;
				opts.onGrilled();
			}
		});

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
				if (opts.requireGrill && !grilled) {
					throw new Error(GRILL_REQUIRED);
				}

				const saved = await opts.bosunApi.publishPlan({
					planId: opts.planId,
					artifact: PublishPlanArgsSchema.parse(args)
				});

				opts.onPublished();

				return textToolResult(JSON.stringify(saved));
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}

// A preparation session names the plans it rewrites by number, the way the
// prompt and the person do. The number is resolved against the selection it was
// created with rather than looked up, so a number outside that selection is
// refused here as well as by the backend.
export function createPrepareDispatch(opts: {
	planId: string;
	plans: PreparePlan[];
	bosunApi: BosunApiService;
	onPublished: () => void;
	onAbandoned: (reason: string) => void;
	onQuestion: (payload: {
		questionId: string;
		questions: PlanQuestion[];
		autoAnswers?: PlanAnswer[];
	}) => void;
}) {
	const idByNumber = new Map(opts.plans.map((plan) => [plan.number, plan.id]));

	const target = (planNumber: number): string => {
		const id = idByNumber.get(planNumber);

		if (!id) {
			throw new Error(
				`#${planNumber} is not one of the plans this preparation was created for (${[...idByNumber.keys()].map((number) => `#${number}`).join(', ')})`
			);
		}

		return id;
	};

	return function build(pending: Map<string, PendingQuestion>) {
		const ask = createAskTool({ pending, onQuestion: opts.onQuestion, auto: true });

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

			if (name === 'publish_plan') {
				const saved = await opts.bosunApi.publishPlan({
					planId: opts.planId,
					artifact: PublishPlanArgsSchema.parse(args)
				});

				opts.onPublished();

				return textToolResult(JSON.stringify(saved));
			}

			if (name === 'republish_plan') {
				const { planNumber, ...artifact } = RepublishPlanArgsSchema.parse(args);
				const saved = await opts.bosunApi.publishPlan({
					planId: target(planNumber),
					artifact: { ...artifact, preparedBy: opts.planId }
				});

				return textToolResult(JSON.stringify(saved));
			}

			if (name === 'set_plan_blockers') {
				const { planNumber, blockedByNumbers } = SetPlanBlockersArgsSchema.parse(args);
				const saved = await opts.bosunApi.setPlanBlockers({
					planId: target(planNumber),
					blockedByNumbers
				});

				return textToolResult(JSON.stringify(saved));
			}

			if (name === 'abandon_preparation') {
				const { reason } = AbandonPreparationArgsSchema.parse(args);

				opts.onAbandoned(reason);

				return textToolResult('preparation abandoned');
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
