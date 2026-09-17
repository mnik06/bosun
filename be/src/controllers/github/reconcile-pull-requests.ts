import { type FastifyBaseLogger } from 'fastify';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { queueIntegration } from 'src/controllers/line/shared/lifecycle';
import { markMerged } from 'src/controllers/line/shared/merge';
import { type Build } from 'src/types/BuildSchema';

const RECONCILE_MS = 5 * 60 * 1000;

async function reconcileBuild(deps: LineDeps, opts: { build: Build; log: FastifyBaseLogger }): Promise<boolean> {
	const { build } = opts;
	const repository = await deps.repositoryRepo.getById(build.repositoryId);

	if (!repository || build.prNumber === null) {
		return false;
	}

	const provider = await deps.gitProviderFor(repository);
	const pull = await provider.getPullRequest({ number: build.prNumber });

	if (pull.merged) {
		await markMerged(deps, { build });

		return true;
	}

	if (pull.state !== 'open' || build.status !== 'in_review' || pull.baseRef !== build.baseBranch) {
		return false;
	}

	const integrated = (await deps.integrationRepo.listForBuild(build.id)).filter((integration) => integration.status === 'done').at(-1);
	const plan = await deps.planRepo.getById(build.planId);

	return integrated?.ontoSha !== pull.baseSha && plan !== null && queueIntegration(deps, { build, plan, trigger: 'base_moved', onto: pull.baseRef });
}

// A webhook delivery can be missed, and a missed merge would leave every plan
// stacked on it waiting forever. So the state of every open bosun pull request is
// read on a timer: a merge nobody was told about is caught here, and so is a base
// that moved without a push event reaching this service.
export async function reconcilePullRequests(deps: LineDeps, opts: { log: FastifyBaseLogger }): Promise<void> {
	const touched = new Set<string>();

	for (const build of await deps.buildRepo.listWithOpenPullRequests()) {
		try {
			if (await reconcileBuild(deps, { build, log: opts.log })) {
				touched.add(build.repositoryId);
			}
		} catch (error) {
			opts.log.warn({ error, buildId: build.id }, 'could not reconcile a pull request');
		}
	}

	for (const repositoryId of touched) {
		await scheduleRepository(deps, { repositoryId });
	}
}

export function startPullRequestReconcile(opts: { deps: LineDeps; log: FastifyBaseLogger }): () => void {
	const timer = setInterval(() => {
		reconcilePullRequests(opts.deps, { log: opts.log }).catch((error: unknown) => {
			opts.log.error({ error }, 'failed reconciling pull requests');
		});
	}, RECONCILE_MS);

	timer.unref();

	return () => {
		clearInterval(timer);
	};
}
