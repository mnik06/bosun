import { type ExecService } from '../services/exec.service';

const PUSH_TIMEOUT_MS = 180_000;

export interface PublishResult {
	ok: boolean;
	prUrl: string | null;
	detail: string;
}

// `gh pr create` prints the URL on success, but it also prints one when a pull
// request for the branch already exists — which is the case bosun hits whenever
// a plan is re-run — so the URL is read out of whatever it said rather than
// treated as a success-only field.
export function findPrUrl(output: string): string | null {
	return /https:\/\/[^\s]*\/pull\/\d+/.exec(output)?.[0] ?? null;
}

export function getPublishService(deps: { exec: ExecService }) {
	return {
		async publish(opts: {
			worktreePath: string;
			branch: string;
			baseRef: string;
			title: string;
			body: string;
		}): Promise<PublishResult> {
			const pushed = await deps.exec.run(
				'git',
				['-C', opts.worktreePath, 'push', '-u', 'origin', opts.branch],
				{ timeoutMs: PUSH_TIMEOUT_MS }
			);

			if (!pushed.ok) {
				return { ok: false, prUrl: null, detail: `could not push ${opts.branch}: ${pushed.reason}` };
			}

			// The base is stripped of its remote: `gh` wants a branch name, and
			// `origin/HEAD` resolves to `origin/main` rather than `main`.
			const base = opts.baseRef.replace(/^origin\//, '');
			const created = await deps.exec.run(
				'gh',
				[
					'pr',
					'create',
					'--head',
					opts.branch,
					'--base',
					base,
					'--title',
					opts.title,
					'--body',
					opts.body
				],
				{ cwd: opts.worktreePath, timeoutMs: PUSH_TIMEOUT_MS }
			);
			const prUrl = findPrUrl(`${created.stdout}\n${created.stderr}`);

			if (prUrl) {
				return { ok: true, prUrl, detail: 'opened' };
			}

			// The branch is pushed either way, so a failure here loses no work — it
			// leaves a branch somebody can open a pull request from by hand.
			return {
				ok: false,
				prUrl: null,
				detail: `${opts.branch} is pushed, but the pull request failed: ${created.reason}`
			};
		}
	};
}

export type PublishService = ReturnType<typeof getPublishService>;
