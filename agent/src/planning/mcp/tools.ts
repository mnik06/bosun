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

const TargetPlanSchema = z
	.string()
	.min(1)
	.optional()
	.describe('the plan this call is for, as `add_plan` returned it; leave it out for the plan this session was started for');

export const NamePlanArgsSchema = z.object({ planId: TargetPlanSchema, title: z.string().min(1) });

export const AddPlanArgsSchema = z.object({
	title: z.string().min(1),
	input: z
		.string()
		.min(1)
		.describe('the part of the ticket this plan delivers, in the ticket\'s own words — the sub-task\'s key, summary and description, or the requirements it takes — so a person reading the new plan knows what it was cut from')
});

export const ReadPlanArgsSchema = z.object({ number: z.number().int().positive() });

export const SetBlockersArgsSchema = z.object({
	planId: TargetPlanSchema,
	blockedByNumbers: z.array(z.number().int().positive())
});

export const PublishPlanArgsSchema = z.object({
	planId: TargetPlanSchema,
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
		'List every plan in this project, in every state — approved or not, building, merged, failed, and ones another session is still writing — with its number, title, state, a summary of its body, its tracer bullets and the footprint of each build bullet: the tables and columns, API contracts and shared modules it creates or changes. `approved` says which are signed off; `sameRepository: false` is another repository\'s plan, there for context only. Call this during recon, before you write anything: it is how you find work already covered, and pieces another plan already builds that yours should consume rather than build a second copy of.',
	read_plan:
		'Read one plan of this project in full by its number: the whole body, every acceptance criterion, and every tracer bullet with its body and footprint. Use it when a `list_plans` summary is not enough to tell whether that plan covers, builds or conflicts with what you are planning.',
	add_plan:
		'Add another plan to this session, for when the ticket is really several features — sub-tasks the person wants planned separately, or work you proposed splitting and the person agreed to. The plan this session was started for is the first; each call adds one more and returns its id and number. An added plan is hidden from the person until every plan of this session is published, and they all appear together; its number is real from the start, so cite it in footprints, blockers and bodies. Every plan is grilled in this session and published by `publish_plan` with its `planId` — the added ones first, the plan this session was started for last — and each is approved, built and verified on its own. Call it as soon as the split is agreed, before publishing any plan; never on your own decision — the person asked for it, or agreed to it through `bosun_ask`.',
	name_plan:
		'Name this plan. Call it as soon as you know what the ticket is about, before the grill starts — until you do, the person watching a list of running sessions sees "Untitled". Call it again if the scope turns out to be something else.',
	set_blockers:
		'Declare the plans whose whole feature this one needs before it can start — not a piece of them, which is a `consumes` entry in a bullet\'s footprint. Names them by plan number, replacing whatever was declared before; pass an empty list to clear. Bosun detects every other dependency itself from footprints when the plan is approved, so declare only what no footprint can say.',
	publish_plan:
		'Publish the whole plan at once: title, markdown body, every acceptance criterion, every tracer bullet with the criteria it claims, its footprint, and `foundation` on bullet 1 when it holds shared pieces, and the `coverage` ledger. Replaces whatever was published before, so a revision re-sends the plan as it should now be rather than a diff. Every AC must be claimed by exactly one bullet, and what is already marked implemented or verified stays that way. Refused with more than ten build bullets, a build bullet without a footprint, or a schema change, contract or created module outside bullet 1. Refused without `coverage` on a new plan, and whenever `coverage` holds a requirement no criterion delivers and no non-goal explains, or the plan holds a criterion no entry traces to. The ledger is checked against the criteria and then discarded — it is never stored in or readable from the plan body.'
};

export const TOOL_SCHEMAS = {
	list_plans: z.object({}),
	read_plan: ReadPlanArgsSchema,
	add_plan: AddPlanArgsSchema,
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
const NOT_HELD = 'Refused: that is not a plan this session writes. Use the id `add_plan` returned, or leave `planId` out for the plan this session was started for.';

// Last, so the plans of one session reach the person together: the added ones
// stay hidden until this one is out, and it is the publish that reveals them.
const ADDED_FIRST = 'Refused: publish every plan you added first, with its `planId`, and the plan this session was started for last — they appear to the person together on that last publish. Still unpublished:';

const COVERAGE_REQUIRED = [
	'Refused: a new plan is published with its `coverage` ledger.',
	'List every requirement from the ticket and its sources, and every gap you found, each with the criteria that deliver it or the non-goal it became.'
].join(' ');

function targetOf(opts: { planId: string; holds: (planId: string) => boolean }) {
	return (planId: string | undefined): string => {
		const id = planId ?? opts.planId;

		if (opts.holds(id)) {
			return id;
		}

		throw new Error(NOT_HELD);
	};
}

function publishRefusal(opts: {
	waiting: string[];
	requireCoverage: boolean;
	acCodes: string[];
	coverage: z.infer<typeof PublishPlanArgsSchema>['coverage'];
}): string | null {
	if (opts.waiting.length > 0) {
		return `${ADDED_FIRST} ${opts.waiting.join(', ')}.`;
	}

	if (opts.coverage === undefined) {
		return opts.requireCoverage ? COVERAGE_REQUIRED : null;
	}

	return coverageRefusal({ acCodes: opts.acCodes, coverage: opts.coverage });
}

async function addPlan(
	opts: { planId: string; bosunApi: BosunApiService; onPlanAdded: (plan: { planId: string; number: number }) => void },
	args: unknown
) {
	const added = await opts.bosunApi.addSessionPlan({ planId: opts.planId, ...AddPlanArgsSchema.parse(args) });

	opts.onPlanAdded(added);

	return textToolResult(JSON.stringify(added));
}

export function createPlanDispatch(opts: {
	planId: string;
	// Read at every ask: a person can switch auto mode while the grill runs.
	isAuto: () => boolean;
	// Off for a revision: the plan handed to it is already the product of a grill,
	// and a change the person asked for in prose is not a new one.
	requireGrill: boolean;
	// Off for a revision too: its criteria haven't changed, so there is no new ledger to check.
	requireCoverage: boolean;
	bosunApi: BosunApiService;
	// Whether `planId` is one of this session's plans: the one it was started for,
	// or one it added. A session must not be able to write over any other plan on the machine.
	holds: (planId: string) => boolean;
	onPlanAdded: (plan: { planId: string; number: number }) => void;
	// The added plans not published yet.
	unpublishedAdded: () => string[];
	onPublished: (planId: string) => void;
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
			auto: opts.isAuto,
			onAnswered: () => {
				grilled = true;
				opts.onGrilled();
			}
		});

		const target = targetOf(opts);

		const publish = async (args: unknown) => {
			if (opts.requireGrill && !grilled) {
				throw new Error(GRILL_REQUIRED);
			}

			const { planId, coverage, ...artifact } = PublishPlanArgsSchema.parse(args);
			const id = target(planId);
			const refusal = publishRefusal({
				waiting: id === opts.planId ? opts.unpublishedAdded() : [],
				requireCoverage: opts.requireCoverage,
				acCodes: artifact.acs.map((ac) => ac.code),
				coverage
			});

			if (refusal !== null) {
				throw new Error(refusal);
			}

			const saved = await opts.bosunApi.publishPlan({ planId: id, artifact });

			opts.onPublished(id);

			return textToolResult(JSON.stringify(saved));
		};

		return async function dispatch(name: string, args: unknown) {
			if (name === 'bosun_ask') {
				return ask(args);
			}

			if (name === 'list_plans') {
				return textToolResult(JSON.stringify(await opts.bosunApi.listMachinePlans()));
			}

			if (name === 'read_plan') {
				const { number } = ReadPlanArgsSchema.parse(args);

				return textToolResult(JSON.stringify(await opts.bosunApi.readPlan(number)));
			}

			if (name === 'add_plan') {
				return addPlan(opts, args);
			}

			if (name === 'name_plan') {
				const { planId, title } = NamePlanArgsSchema.parse(args);
				const id = target(planId);

				await opts.bosunApi.savePlanName({ planId: id, title });

				return textToolResult(id);
			}

			if (name === 'set_blockers') {
				const { planId, blockedByNumbers } = SetBlockersArgsSchema.parse(args);
				const saved = await opts.bosunApi.setPlanBlockers({ planId: target(planId), blockedByNumbers });

				return textToolResult(JSON.stringify(saved));
			}

			if (name === 'publish_plan') {
				return publish(args);
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
