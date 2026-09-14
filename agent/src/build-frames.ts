import { z } from 'zod';

// Mirrors `be/src/types/build-frames.ts`. Kept out of `protocol.ts` only for its length.

export const RegeneratedSchema = z.object({ name: z.string(), files: z.array(z.string()) });

export type Regenerated = z.infer<typeof RegeneratedSchema>;

export const ResolvedConflictSchema = z.object({ file: z.string(), diff: z.string() });

export type ResolvedConflict = z.infer<typeof ResolvedConflictSchema>;

export const BuildWorktreeEnsureMsgSchema = z.object({
	type: z.literal('build.worktree.ensure'),
	buildId: z.string(),
	slug: z.string(),
	branch: z.string(),
	fresh: z.boolean(),
	startFrom: z.string().nullable(),
	mergeIn: z.array(z.string()),
	configDraft: z.string().nullable()
});

export type BuildWorktreeEnsure = z.infer<typeof BuildWorktreeEnsureMsgSchema>;

export const BuildWorktreeRemoveMsgSchema = z.object({
	type: z.literal('build.worktree.remove'),
	buildId: z.string(),
	slug: z.string()
});

export const BuildWorktreeReadyMsgSchema = z.object({
	type: z.literal('build.worktree.ready'),
	buildId: z.string(),
	worktreePath: z.string(),
	baseRef: z.string(),
	headSha: z.string().nullable()
});

export const BuildWorktreeErrorMsgSchema = z.object({
	type: z.literal('build.worktree.error'),
	buildId: z.string(),
	message: z.string()
});

export const PlanCriteriaSchema = z.object({
	planNumber: z.number().int(),
	title: z.string(),
	acs: z.array(z.object({ code: z.string(), text: z.string() }))
});

export type PlanCriteria = z.infer<typeof PlanCriteriaSchema>;

export const IntegrateStartMsgSchema = z.object({
	type: z.literal('integrate.start'),
	integrationId: z.string(),
	buildId: z.string(),
	worktreePath: z.string(),
	branch: z.string(),
	onto: z.string(),
	configDraft: z.string().nullable(),
	autoResolve: z.boolean(),
	criteria: PlanCriteriaSchema,
	portBase: z.number().int(),
	memoryMaxBytes: z.number().int().positive().nullable()
});

export type IntegrateStart = z.infer<typeof IntegrateStartMsgSchema>;

export const IntegrateCancelMsgSchema = z.object({
	type: z.literal('integrate.cancel'),
	integrationId: z.string()
});

export const IntegrateActivityMsgSchema = z.object({
	type: z.literal('integrate.activity'),
	integrationId: z.string(),
	label: z.string()
});

export const IntegrateDoneMsgSchema = z.object({
	type: z.literal('integrate.done'),
	integrationId: z.string(),
	ontoSha: z.string().nullable(),
	headSha: z.string().nullable(),
	merged: z.boolean(),
	regenerated: z.array(RegeneratedSchema),
	resolved: z.array(ResolvedConflictSchema),
	checks: z.enum(['passed', 'skipped'])
});

export const IntegrateNeedsYouMsgSchema = z.object({
	type: z.literal('integrate.needs_you'),
	integrationId: z.string(),
	reason: z.enum(['conflict', 'checks', 'error']),
	detail: z.string()
});

export const BuildSummarizeMsgSchema = z.object({
	type: z.literal('build.summarize'),
	planId: z.string(),
	worktreePath: z.string(),
	branch: z.string(),
	baseRef: z.string(),
	planTitle: z.string(),
	planBodyMd: z.string()
});

export type BuildSummarize = z.infer<typeof BuildSummarizeMsgSchema>;

export const LineAskMsgSchema = z.object({
	type: z.literal('line.ask'),
	repositoryId: z.string(),
	askId: z.string(),
	question: z.string(),
	state: z.string(),
	transcript: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
});

export type LineAsk = z.infer<typeof LineAskMsgSchema>;

export const LineAnswerTextMsgSchema = z.object({
	type: z.literal('line.answer.text'),
	repositoryId: z.string(),
	askId: z.string(),
	delta: z.string()
});

export const LineAnswerDoneMsgSchema = z.object({
	type: z.literal('line.answer.done'),
	repositoryId: z.string(),
	askId: z.string(),
	content: z.string()
});

export const LineAnswerErrorMsgSchema = z.object({
	type: z.literal('line.answer.error'),
	repositoryId: z.string(),
	askId: z.string(),
	message: z.string()
});
