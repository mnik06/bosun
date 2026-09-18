import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { getOwnedBuild } from 'src/controllers/line/shared/build-access';
import { toGitProviderHttpError } from 'src/controllers/line/shared/git-provider-error';
import { footprintPieces } from 'src/types/FootprintSchema';

// A pull request holding only a provider's foundation commits, so the plans stacked
// on its first bullet are not held by a slow review of the rest of it.
export async function shipFoundation(deps: LineDeps, opts: { id: string; projectId: string }): Promise<{ prUrl: string }> {
	const { build, plan } = await getOwnedBuild(deps, opts);
	const [slices, runs, repository] = await Promise.all([
		deps.sliceRepo.listByPlan(plan.id),
		deps.sliceRunRepo.listForBuild(build.id),
		deps.repositoryRepo.getById(build.repositoryId)
	]);
	const foundation = slices.find((slice) => slice.foundation);
	const landed = foundation ? runs.find((run) => run.sliceId === foundation.id && run.phase === null && run.status === 'done') : undefined;

	if (!foundation) {
		throw new HttpError(409, 'This plan has no foundation bullet');
	}

	if (!landed?.commitSha || build.branch === null) {
		throw new HttpError(409, 'The foundation has not landed yet');
	}

	if (!repository) {
		throw new HttpError(409, 'This repository is no longer connected');
	}

	const branch = `${build.branch}-foundation`;
	const pieces = footprintPieces(foundation.footprint).map((piece) => `- ${piece.kind}: \`${piece.label}\``);

	try {
		const provider = await deps.gitProviderFor(repository);

		await provider.pointBranch({ branch, sha: landed.commitSha });

		const opened = await provider.openOrUpdatePullRequest({
			head: branch,
			base: repository.defaultBranch,
			title: `#${plan.number} foundation — ${foundation.title}`,
			body: [
				`The foundation of **#${plan.number} ${plan.title ?? 'Untitled plan'}**: its first bullet alone, so the plans stacked on it are not held by the review of the rest.`,
				pieces.length === 0 ? '' : `## What it provides\n\n${pieces.join('\n')}`,
				`**[Plan #${plan.number} in bosun](${deps.appUrl}/plans/${plan.id}?tab=changes)**`
			]
				.filter(Boolean)
				.join('\n\n')
		});

		return { prUrl: opened.url };
	} catch (error) {
		throw toGitProviderHttpError(error);
	}
}
