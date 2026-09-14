import { type NeedsYouItem } from 'src/api/routes/schemas/line/LineSchemas';
import { type LineDeps } from 'src/controllers/line/line-deps';

// With actions only on plan pages, this is what brings a person to the one that is
// waiting: every open question, overlap decision and unresolved integration in the
// project, each naming its plan.
export async function getNeedsYou(deps: LineDeps, opts: { projectId: string }): Promise<NeedsYouItem[]> {
	const [questions, stopped] = await Promise.all([
		deps.sliceRunRepo.listOpenQuestionsForProject(opts.projectId),
		deps.buildRepo.listForProject({ projectId: opts.projectId, statuses: ['needs_you'] })
	]);
	const questionBuilds = new Map(
		(await Promise.all([...new Set(questions.map((run) => run.buildId))].map(async (id) => deps.buildRepo.getById(id))))
			.filter((build) => build !== null)
			.map((build) => [build.id, build])
	);
	const plans = new Map(
		(await deps.planRepo.listByIds([...new Set([...stopped.map((build) => build.planId), ...[...questionBuilds.values()].map((build) => build.planId)])])).map((plan) => [plan.id, plan])
	);

	const asked = questions.flatMap((run) => {
		const plan = plans.get(questionBuilds.get(run.buildId)?.planId ?? '');

		return plan
			? [{ kind: 'question' as const, planId: plan.id, planNumber: plan.number, planTitle: plan.title, detail: run.question?.[0]?.question ?? 'A bullet is asking a question' }]
			: [];
	});
	const blocked = stopped.flatMap((build) => {
		const plan = plans.get(build.planId);

		return plan
			? [{ kind: build.needsYouReason ?? ('integration' as const), planId: plan.id, planNumber: plan.number, planTitle: plan.title, detail: build.failureReason ?? 'needs a decision' }]
			: [];
	});

	return [...asked, ...blocked].sort((a, b) => a.planNumber - b.planNumber);
}
