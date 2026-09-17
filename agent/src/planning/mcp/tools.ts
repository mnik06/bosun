import { z } from 'zod';
import { ASK_DEFINITION } from '../../sessions/ask';
import {
	createAskTool,
	mcpToolDefinition,
	textToolResult,
	type PendingQuestion
} from '../../sessions/mcp-server';
import { FootprintSchema } from '../../footprint';
import { type PlanAnswer, type PlanQuestion } from '../../protocol';
import { type BosunApiService } from '../../services/bosun-api.service';
import { CoverageEntrySchema, coverageRefusal } from '../coverage';

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
				acCodes: z.array(z.string().min(1)),
				foundation: z
					.boolean()
					.optional()
					.describe('true on bullet 1 when it holds every piece another plan could consume; never on any other bullet'),
				footprint: FootprintSchema.nullable()
					.optional()
					.describe('required on every build bullet, and absent on the verify bullet: what this bullet creates, changes and consumes')
			})
		)
		.min(1),
	coverage: z
		.array(CoverageEntrySchema)
		.optional()
		.describe('the requirements ledger: one entry per requirement in the ticket and its sources, and per gap this session found, each with the criteria that deliver it or the non-goal it became. Required on a new plan; on a revision, sent only to replace the ledger')
});

const DESCRIPTIONS: Record<string, string> = {
	list_plans:
		'List every plan written for this repository — number, title, state, its tracer bullets, and for every approved plan not yet merged the footprint of each bullet: the tables and columns, API contracts and shared modules it creates or changes. Call this during recon, before you write anything: it is how you find work already covered, and pieces another plan already builds that yours should consume rather than build a second copy of.',
	name_plan:
		'Name this plan. Call it as soon as you know what the ticket is about, before the grill starts — until you do, the person watching a list of running sessions sees "Untitled". Call it again if the scope turns out to be something else.',
	set_blockers:
		'Declare the plans whose whole feature this one needs before it can start — not a piece of them, which is a `consumes` entry in a bullet\'s footprint. Names them by plan number, replacing whatever was declared before; pass an empty list to clear. Bosun detects every other dependency itself from footprints when the plan is approved, so declare only what no footprint can say.',
	publish_plan:
		'Publish the whole plan at once: title, markdown body, every acceptance criterion, every tracer bullet with the criteria it claims, its footprint, and `foundation` on bullet 1 when it holds shared pieces, and the `coverage` ledger. Replaces whatever was published before, so a revision re-sends the plan as it should now be rather than a diff. Every AC must be claimed by exactly one bullet, and what is already marked implemented or verified stays that way. Refused with more than six build bullets, a build bullet without a footprint, or a schema change, contract or created module outside bullet 1. Refused without `coverage` on a new plan, and whenever `coverage` holds a requirement no criterion delivers and no non-goal explains, or the plan holds a criterion no entry traces to. The ledger is checked against the criteria and then discarded — it is never stored in or readable from the plan body.'
};

export const TOOL_SCHEMAS = {
	list_plans: z.object({}),
	name_plan: NamePlanArgsSchema,
	set_blockers: SetBlockersArgsSchema,
	publish_plan: PublishPlanArgsSchema
} as const;

// Derived from the Zod schemas rather than written out beside them. Hand-keeping
// two declarations of the same shape in sync is a drift the model only discovers
// by calling a tool with arguments the parser then rejects.
export const TOOL_DEFINITIONS = [
	ASK_DEFINITION,
	...Object.entries(TOOL_SCHEMAS).map(([name, schema]) =>
		mcpToolDefinition({ name, description: DESCRIPTIONS[name]!, schema })
	)
];

// The one thing a session cannot be trusted to enforce on itself. A turn that
// runs long, loses the thread and writes the plan it already had in mind is the
// failure this catches: the person is grilled precisely because the plan is not
// supposed to be the model's own first draft. An auto plan is exempt because its
// answers are the model's own by design, and a revision is exempt because the
// plan it is editing was already grilled into existence.
const GRILL_REQUIRED = [
	'Refused: this plan has not been grilled yet, so there is nothing to publish.',
	'Not one `bosun_ask` question has been put to the person and answered.',
	'Run the grill — one question at a time, with `bosun_ask` — and publish once the decisions are settled.'
].join(' ');

// Asked of the prompt alone, a session published 22 criteria from a ticket that
// stated 126, and nothing downstream reads the ticket again to notice.
const COVERAGE_REQUIRED = [
	'Refused: a new plan is published with its `coverage` ledger.',
	'List every requirement from the ticket and its sources, and every gap you found, each with the criteria that deliver it or the non-goal it became.'
].join(' ');

export function createPlanDispatch(opts: {
	planId: string;
	auto: boolean;
	// Off for a revision: the plan handed to it is already the product of a grill,
	// and a change the person asked for in prose is not a new one.
	requireGrill: boolean;
	// Off for a revision too: its criteria haven't changed, so there is no new ledger to check.
	requireCoverage: boolean;
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

				const { coverage, ...artifact } = PublishPlanArgsSchema.parse(args);

				if (opts.requireCoverage && coverage === undefined) {
					throw new Error(COVERAGE_REQUIRED);
				}

				const refusal = coverage === undefined ? null : coverageRefusal({ acCodes: artifact.acs.map((ac) => ac.code), coverage });

				if (refusal !== null) {
					throw new Error(refusal);
				}

				const saved = await opts.bosunApi.publishPlan({
					planId: opts.planId,
					artifact
				});

				opts.onPublished();

				return textToolResult(JSON.stringify(saved));
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
