import { z } from 'zod';
import { ASK_DEFINITION } from '../../sessions/ask';
import { createAskTool, textToolResult, type PendingQuestion } from '../../sessions/mcp-server';
import { type PlanQuestion } from '../../protocol';
import { type BosunApiService } from '../../services/bosun-api.service';
import { type StackUpResult } from '../../services/stack.service';

// The same view planning had. A bullet is executed with only its own plan in
// front of it, so when it hits something a sibling plan owns, this is how it
// finds out rather than guessing or building it twice.
const LIST_PLANS_DEFINITION = {
	name: 'list_plans',
	description:
		'List every plan written for this repository — number, title, state, its tracer bullets, and for approved plans not yet merged the footprint of each bullet (the schema, contracts and modules it creates or changes). Use it when your work touches something you suspect another plan owns, so you use it rather than duplicating or pre-empting it.',
	inputSchema: z.toJSONSchema(z.object({}), { target: 'draft-7' })
};

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

export const MarkAcArgsSchema = z.object({ code: z.string().min(1) });

export const BlockAcArgsSchema = z.object({
	code: z.string().min(1),
	reason: z.string().min(1)
});

// The escape hatch that keeps the gate honest. Without it a criterion nobody
// could drive left the session two options — claim it passed, or fail the whole
// branch — and both are worse than saying so.
const BLOCK_AC_DEFINITION = {
	name: 'mark_ac_blocked',
	description:
		'Record that an acceptance criterion could not be driven, and why — the app would not start, the journey needs data that does not exist, the feature is unreachable from the interface. Use it only after trying: it is not a way to skip work, and the reason is carried verbatim into the pull request. A criterion you drove and watched fail is a finding, not a blocker.',
	inputSchema: z.toJSONSchema(BlockAcArgsSchema, { target: 'draft-7' })
};

// Two tools rather than one with a flag: which of the two columns a session may
// tick is decided by the session it is, and a flag is something a model can get
// wrong. A build bullet cannot reach `mark_ac_verified` at all.
const MARK_IMPLEMENTED_DEFINITION = {
	name: 'mark_ac_implemented',
	description:
		'Tick one acceptance criterion as implemented, by its code. Do it the moment the code that satisfies it is written and its feedback loop is green — not in a batch at the end. This bullet cannot finish while one of the criteria it claims is unticked.',
	inputSchema: z.toJSONSchema(MarkAcArgsSchema, { target: 'draft-7' })
};

const MARK_VERIFIED_DEFINITION = {
	name: 'mark_ac_verified',
	description:
		'Tick one acceptance criterion as verified, by its code. Call it only after you have watched it hold in the running product — the journey driven, the state reached, the result seen.',
	inputSchema: z.toJSONSchema(MarkAcArgsSchema, { target: 'draft-7' })
};

export const ReportFindingArgsSchema = z.object({
	acCode: z.string().min(1).nullable().optional().describe('the criterion this finding fails, for kind "criterion"'),
	kind: z.enum(['criterion', 'console', 'network', 'visual']),
	reproduction: z
		.string()
		.min(1)
		.describe('the starting state, every step, what was expected and what happened — enough for somebody who never saw it to see it'),
	severity: z.enum(['high', 'medium', 'low']).optional()
});

// A finding is a row, not a line in a report: the fix session is handed exactly
// these, the re-check drives exactly the criteria they name, and the pull request
// lists the ones left.
const REPORT_FINDING_DEFINITION = {
	name: 'report_finding',
	description:
		'Record something broken you saw in the running product: a criterion that fails (kind "criterion" with its acCode), a console error, a failed request, or a visual defect. Each one is handed to the fix session as written, so the reproduction must stand on its own.',
	inputSchema: z.toJSONSchema(ReportFindingArgsSchema, { target: 'draft-7' })
};

export const ResolveFindingArgsSchema = z.object({
	findingId: z.string().min(1),
	status: z.enum(['fixed', 'left']),
	note: z.string().min(1).describe('what changed, or why it was left')
});

const RESOLVE_FINDING_DEFINITION = {
	name: 'resolve_finding',
	description:
		'Account for one finding the drive reported, by its id: "fixed" with what changed, or "left" with the reason. Every finding must be resolved before this session ends; a left one goes into the pull request as a known gap.',
	inputSchema: z.toJSONSchema(ResolveFindingArgsSchema, { target: 'draft-7' })
};

export const StackUpArgsSchema = z.object({ apps: z.array(z.string()).optional() });

// The agent starts the processes so that starting the stack means the same thing
// in every session and on every machine; the session only decides when.
const STACK_UP_DEFINITION = {
	name: 'stack_up',
	description:
		'Start this project\'s apps from .bosun/project.yaml — all of them, or the named ones with their dependencies — in dependency order, each on its own port in your range, with the other apps\' URLs wired into its environment. Returns only once every app answers its readiness check, with each app\'s URL and log file. On a failure it returns the app, the reason and the tail of its log, and stops what it started. Never start an app any other way. Call stack_down the moment you no longer need it.',
	inputSchema: z.toJSONSchema(StackUpArgsSchema, { target: 'draft-7' })
};

const STACK_DOWN_DEFINITION = {
	name: 'stack_down',
	description: 'Stop every app stack_up started in this session. Call it before running typecheck, lint or tests: a running stack holds memory the loop needs.',
	inputSchema: z.toJSONSchema(z.object({}), { target: 'draft-7' })
};

export type ExecutionPhase = 'build' | 'drive' | 'recheck' | 'fix';

interface ToolSet {
	phase: ExecutionPhase;
	handsOff: boolean;
	// Only a repository machine whose config declares apps can start a stack.
	stack: boolean;
}

// A hands-off plan's bullets are given no way to ask at all, rather than a tool
// they are told not to call: a model that can see `bosun_ask` will eventually
// reach for it. Only a build bullet ever asks — a verify session's questions are
// findings, and nobody is waiting on one.
export function executionDefinitions(opts: ToolSet): { name: string }[] {
	const stack = opts.stack ? [STACK_UP_DEFINITION, STACK_DOWN_DEFINITION] : [];

	switch (opts.phase) {
		case 'build':
			return [
				...(opts.handsOff ? [] : [ASK_DEFINITION]),
				LIST_PLANS_DEFINITION,
				RECORD_DECISION_DEFINITION,
				MARK_IMPLEMENTED_DEFINITION,
				...stack
			];
		case 'drive':
		case 'recheck':
			return [MARK_VERIFIED_DEFINITION, BLOCK_AC_DEFINITION, REPORT_FINDING_DEFINITION, ...stack];
		case 'fix':
			return [LIST_PLANS_DEFINITION, RECORD_DECISION_DEFINITION, RESOLVE_FINDING_DEFINITION];
	}
}

export function executionMcpTools(opts: ToolSet): string[] {
	return executionDefinitions(opts).map((definition) => `mcp__bosun__${definition.name}`);
}

export interface SessionStack {
	up(apps?: string[]): Promise<StackUpResult>;
	down(): Promise<void>;
}

async function stackTool(opts: { name: string; args: unknown; stack: SessionStack }) {
	if (opts.name === 'stack_down') {
		await opts.stack.down();

		return textToolResult('stack stopped');
	}

	const result = await opts.stack.up(StackUpArgsSchema.parse(opts.args).apps);

	return result.ok
		? textToolResult(JSON.stringify(result.apps))
		: textToolResult(`${result.app} did not come up: ${result.reason}\n--- last lines of its log ---\n${result.logTail}`, true);
}

async function markTool(opts: { name: string; args: unknown; planId: string; bosunApi: BosunApiService }) {
	if (opts.name === 'mark_ac_blocked') {
		const { code, reason } = BlockAcArgsSchema.parse(opts.args);

		return textToolResult(JSON.stringify(await opts.bosunApi.markPlanAc({ planId: opts.planId, code, blockedReason: reason })));
	}

	const { code } = MarkAcArgsSchema.parse(opts.args);

	return textToolResult(
		JSON.stringify(
			await opts.bosunApi.markPlanAc({
				planId: opts.planId,
				code,
				...(opts.name === 'mark_ac_verified' ? { verified: true } : { implemented: true })
			})
		)
	);
}

export function createExecutionDispatch(opts: {
	toolSet: ToolSet;
	planId: string;
	sliceId: string;
	buildId: string;
	runId: string;
	bosunApi: BosunApiService;
	stack: SessionStack | null;
	onQuestion: (payload: { questionId: string; questions: PlanQuestion[] }) => void;
}) {
	// Refused here as well as left out of the list: the list is what the model is
	// told, and this is what it can actually do.
	const allowed = new Set(executionDefinitions(opts.toolSet).map((definition) => definition.name));

	return function build(pending: Map<string, PendingQuestion>) {
		const ask = createAskTool({ pending, onQuestion: opts.onQuestion });

		return async function dispatch(name: string, args: unknown) {
			if (!allowed.has(name)) {
				throw new Error(`unknown tool ${name}`);
			}

			switch (name) {
				case 'bosun_ask':
					return ask(args);
				case 'list_plans':
					return textToolResult(JSON.stringify(await opts.bosunApi.listMachinePlans()));
				case 'stack_up':
				case 'stack_down':
					return stackTool({ name, args, stack: opts.stack! });
				case 'mark_ac_implemented':
				case 'mark_ac_verified':
				case 'mark_ac_blocked':
					return markTool({ name, args, planId: opts.planId, bosunApi: opts.bosunApi });
				case 'report_finding': {
					const parsed = ReportFindingArgsSchema.parse(args);

					return textToolResult(
						JSON.stringify(
							await opts.bosunApi.reportFinding({
								buildId: opts.buildId,
								runId: opts.runId,
								acCode: parsed.acCode ?? null,
								kind: parsed.kind,
								reproduction: parsed.reproduction,
								severity: parsed.severity ?? 'medium'
							})
						)
					);
				}
				case 'resolve_finding':
					return textToolResult(JSON.stringify(await opts.bosunApi.resolveFinding(ResolveFindingArgsSchema.parse(args))));
				default: {
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
			}
		};
	};
}
