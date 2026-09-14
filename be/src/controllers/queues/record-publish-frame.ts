import { type AdvanceDeps } from 'src/controllers/queues/advance-deps';
import { publishablePlan, pullRequestText } from 'src/controllers/queues/shared/pull-request';
import { GithubError } from 'src/services/github/github-app.service';
import { type Queue, type QueueItem } from 'src/types/QueueSchema';
import { type AgentMsg } from 'src/types/protocol';

type PublishFrame = Extract<AgentMsg, { type: 'queue.published' | 'queue.publish.error' | 'queue.pushed' }>;

// A repository machine pushed its branch and stopped there; the pull request is
// opened here, through the App, so the machine holds no GitHub credential and
// needs no `gh`. The re-run behaviour matches what `gh` gave: a pull request
// already open for the branch has its description replaced.
async function openThroughApp(
	deps: AdvanceDeps,
	opts: { queue: Queue; item: QueueItem; branch: string }
): Promise<{ prUrl: string } | { failure: string }> {
	const machine = await deps.machineRepo.getById(opts.queue.machineId);
	const repository = machine?.repositoryId ? await deps.repositoryRepo.getById(machine.repositoryId) : null;
	const installation = repository ? await deps.githubInstallationRepo.getById(repository.installationId) : null;
	const publishable = await publishablePlan(deps, { queue: opts.queue, item: opts.item });

	if (!repository || !installation) {
		return { failure: `${opts.branch} is pushed, but this machine's repository is no longer connected to a GitHub installation` };
	}

	if (!publishable) {
		return { failure: `${opts.branch} is pushed, but the plan has nothing finished to open a pull request for` };
	}

	try {
		const text = await pullRequestText(deps, publishable);
		const opened = await deps.githubApp.openOrUpdatePullRequest({
			installationId: installation.installationId,
			githubRepoId: repository.githubRepoId,
			head: opts.branch,
			base: publishable.baseRef.replace(/^origin\//, ''),
			...text
		});

		return { prUrl: opened.url };
	} catch (error) {
		if (error instanceof GithubError) {
			return { failure: `${opts.branch} is pushed, but the pull request failed: ${error.message}` };
		}

		throw error;
	}
}

// A failed publish is recorded on the item but does not change its status: the
// bullets all landed and the commits are real, so calling the plan failed
// because a credential is missing would misreport what actually happened.
export async function recordPublishFrame(
	deps: AdvanceDeps,
	opts: { machineId: string; frame: PublishFrame }
): Promise<void> {
	const item = await deps.queueItemRepo.getById(opts.frame.itemId);
	const queue = item ? await deps.queueRepo.getById(item.queueId) : null;

	if (!item || !queue || queue.machineId !== opts.machineId) {
		return;
	}

	if (opts.frame.type === 'queue.pushed') {
		const outcome = await openThroughApp(deps, { queue, item, branch: opts.frame.branch });

		await deps.queueItemRepo.update(
			'prUrl' in outcome
				? { id: item.id, prUrl: outcome.prUrl, failureReason: null }
				: { id: item.id, failureReason: outcome.failure }
		);

		return;
	}

	await deps.queueItemRepo.update(
		opts.frame.type === 'queue.published'
			? { id: item.id, prUrl: opts.frame.prUrl, failureReason: null }
			: { id: item.id, failureReason: opts.frame.message }
	);
}
