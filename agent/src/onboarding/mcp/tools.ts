import { z } from 'zod';
import { textToolResult, type SessionDispatchFactory } from '../../sessions/mcp-server';
import { type BosunApiService } from '../../services/bosun-api.service';

export const ReportStepArgsSchema = z.object({
	label: z.string().trim().min(1).max(200),
	status: z.enum(['info', 'running', 'passed', 'failed']),
	detail: z.string().max(4000).optional(),
	progress: z.number().min(0).max(1).optional()
});

export const PublishConfigArgsSchema = z.object({ yaml: z.string().min(1).max(100_000) });

export const ReportRequirementArgsSchema = z
	.object({
		kind: z.enum(['env', 'secret', 'policy']),
		path: z.string().max(200).optional(),
		key: z.string().min(1).max(100),
		why: z.string().trim().min(1).max(1000),
		evidence: z.string().trim().min(1).max(500)
	})
	.refine((requirement) => requirement.kind !== 'env' || requirement.path !== undefined, {
		message: 'an env requirement names the folder its .env lives in, as path',
		path: ['path']
	});

// The same limits the backend holds an assumption to. A person skims these as a
// list, so one is a sentence; a longer one is refused and has to be rewritten.
export const RecordAssumptionArgsSchema = z.object({
	text: z.string().trim().min(1).max(240),
	evidence: z.string().trim().min(1).max(120)
});

export const ReportSignInArgsSchema = z.object({
	role: z.string().trim().min(1).max(40),
	ok: z.boolean(),
	detail: z.string().max(1000)
});

const PublishRespSchema = z.union([
	z.object({ ok: z.literal(true) }),
	z.object({ ok: z.literal(false), issues: z.array(z.object({ path: z.string(), message: z.string() })) })
]);

function definition(opts: { name: string; description: string; schema: z.ZodType }) {
	return {
		name: opts.name,
		description: opts.description,
		inputSchema: z.toJSONSchema(opts.schema, { target: 'draft-7' })
	};
}

// No `bosun_ask`, deliberately: discovery depends on no answer mid-way. What it
// cannot find it lists as a requirement, and what it has to guess it records as
// an assumption, so the operator makes one visit at the end instead of a vigil.
export const DISCOVERY_DEFINITIONS = [
	definition({
		name: 'report_step',
		description:
			'Add one progress line to the onboarding report the operator sees in the browser: what you are looking at or running now, and how it went. Short labels; put command output that matters in detail. Set progress to your honest estimate of how far through discovery you are, 0 to 1 — roughly 0.2 once you know the packages and apps, 0.5 once the commands are tried, 0.7 when the config is written. It only ever moves forward.',
		schema: ReportStepArgsSchema
	}),
	definition({
		name: 'publish_config',
		description:
			'Publish the whole `.bosun/project.yaml` you have written, as YAML. Bosun validates it: when it is refused you get every field that is wrong and must fix them and publish again. Publishing again replaces what you published before. Discovery fails unless a publish succeeds.',
		schema: PublishConfigArgsSchema
	}),
	definition({
		name: 'report_requirement',
		description:
			'List one input only the operator can give: an env key a package reads (kind env, with the path of the folder whose .env holds it), a secret a session needs in its environment such as a test-account password (kind secret), or whether this machine may apply migrations (kind policy, key applyMigrations). Say why it is needed and cite the file that told you.',
		schema: ReportRequirementArgsSchema
	}),
	definition({
		name: 'record_assumption',
		description:
			'Record something you had to guess — which script is the real start command, which of two databases is meant. One plain sentence (at most 240 characters) saying what you assumed, and evidence naming the file or files it came from (at most 120 characters, no quotes from them). The operator skims these before trusting the config.',
		schema: RecordAssumptionArgsSchema
	})
];

export const DISCOVERY_MCP_TOOLS = DISCOVERY_DEFINITIONS.map((entry) => `mcp__bosun__${entry.name}`);

export const SIGN_IN_DEFINITIONS = [
	definition({
		name: 'report_sign_in',
		description:
			'Report whether you signed in as one test account and reached a page past the sign-in screen. Call it once per account, including the ones that failed, with what you saw.',
		schema: ReportSignInArgsSchema
	})
];

export const SIGN_IN_MCP_TOOLS = SIGN_IN_DEFINITIONS.map((entry) => `mcp__bosun__${entry.name}`);

export function describePublishAnswer(answer: unknown): { published: boolean; text: string } {
	const parsed = PublishRespSchema.safeParse(answer);

	if (!parsed.success) {
		return { published: false, text: 'Bosun gave an answer this session could not read — publish again.' };
	}

	if (parsed.data.ok) {
		return { published: true, text: 'Published. This is now the repository\'s draft config in bosun.' };
	}

	return {
		published: false,
		text: `Not published — the config is invalid. Fix every one of these, then call publish_config again:\n${parsed.data.issues
			.map((issue) => `- ${issue.path}: ${issue.message}`)
			.join('\n')}`
	};
}

export function createDiscoveryDispatch(opts: {
	runId: string;
	bosunApi: BosunApiService;
	onPublished: () => void;
	// Turns the session's estimate into the progress bosun records: never backwards,
	// never the whole bar before the run has actually finished.
	advance: (estimate: number | undefined) => number | null;
}): SessionDispatchFactory {
	return () =>
		async function dispatch(name: string, args: unknown) {
			if (name === 'report_step') {
				const parsed = ReportStepArgsSchema.parse(args);

				await opts.bosunApi.reportOnboardingStep({
					runId: opts.runId,
					label: parsed.label,
					status: parsed.status,
					detail: parsed.detail ?? null,
					progress: opts.advance(parsed.progress)
				});

				return textToolResult('recorded');
			}

			if (name === 'publish_config') {
				const answer = describePublishAnswer(
					await opts.bosunApi.publishOnboardingConfig({ runId: opts.runId, ...PublishConfigArgsSchema.parse(args) })
				);

				if (answer.published) {
					opts.onPublished();
				}

				return textToolResult(answer.text, !answer.published);
			}

			if (name === 'report_requirement') {
				const parsed = ReportRequirementArgsSchema.parse(args);

				await opts.bosunApi.reportOnboardingRequirement({
					runId: opts.runId,
					kind: parsed.kind,
					path: parsed.path ?? null,
					key: parsed.key,
					why: parsed.why,
					evidence: parsed.evidence
				});

				return textToolResult('recorded');
			}

			if (name === 'record_assumption') {
				await opts.bosunApi.recordOnboardingAssumption({ runId: opts.runId, ...RecordAssumptionArgsSchema.parse(args) });

				return textToolResult('recorded');
			}

			throw new Error(`unknown tool ${name}`);
		};
}

export function createSignInDispatch(opts: {
	onReport: (report: z.infer<typeof ReportSignInArgsSchema>) => void;
}): SessionDispatchFactory {
	return () =>
		async function dispatch(name: string, args: unknown) {
			if (name !== 'report_sign_in') {
				throw new Error(`unknown tool ${name}`);
			}

			opts.onReport(ReportSignInArgsSchema.parse(args));

			return textToolResult('recorded');
		};
}
