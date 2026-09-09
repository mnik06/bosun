import { z } from 'zod';
import { textToolResult, type PendingQuestion } from '../../sessions/mcp-server';
import { type BosunApiService } from '../../services/bosun-api.service';

export const PublishSummaryArgsSchema = z.object({
	headline: z.string().min(1),
	areas: z
		.array(
			z.object({
				name: z.string().min(1),
				why: z.string().min(1),
				entries: z.array(
					z.object({
						path: z.string().min(1),
						kind: z.enum(['added', 'changed', 'removed']),
						note: z.string().min(1)
					})
				)
			})
		)
		.min(1)
});

export const SUMMARY_TOOL_DEFINITIONS = [
	{
		name: 'publish_summary',
		description:
			'Publish the map of this branch: a one-paragraph headline, then the areas it touched, each with why it matters and the handful of files a reviewer would be lost without. Ranked, not complete — leave out anything somebody could infer. Call it exactly once, at the end.',
		inputSchema: z.toJSONSchema(PublishSummaryArgsSchema, { target: 'draft-7' })
	}
];

export function createSummaryDispatch(opts: { planId: string; bosunApi: BosunApiService }) {
	return function build(_pending: Map<string, PendingQuestion>) {
		return async function dispatch(name: string, args: unknown) {
			if (name === 'publish_summary') {
				await opts.bosunApi.savePlanSummary({
					planId: opts.planId,
					summary: PublishSummaryArgsSchema.parse(args)
				});

				return textToolResult(opts.planId);
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
