import fs from 'fs';
import path from 'path';
import { networkGitEnv } from '../execution/commit';
import { type ExecService } from '../services/exec.service';

const GIT_TIMEOUT_MS = 60_000;
const NETWORK_TIMEOUT_MS = 180_000;
const DIFF_KEPT_CHARS = 4_000;
const MARKER = /^(<{7}|={7}|>{7})( |$)/m;

type Git = (args: string[], timeoutMs?: number) => ReturnType<ExecService['run']>;

export type Step<T = void> = ({ ok: true } & (T extends void ? unknown : { value: T })) | { ok: false; detail: string };

function lines(stdout: string): string[] {
	return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function globPathspecs(globs: string[]): string[] {
	return globs.map((glob) => `:(glob)${glob}`);
}

function clipDiff(diff: string): string {
	return diff.length <= DIFF_KEPT_CHARS ? diff : `${diff.slice(0, DIFF_KEPT_CHARS)}\n… (clipped)`;
}

// The plans whose commits a conflict comes from, read off the merge commits and
// branch names the target branch's history carries for the conflicted files.
export function planNumbersIn(subjects: string): number[] {
	return [...new Set([...subjects.matchAll(/bosun\/plan\/(\d+)/g)].map((match) => Number(match[1])))];
}

// The git half of an integration, kept apart from the session that drives it so
// every step can be exercised against a real repository in a test. Each step is
// safe to abandon: `abandon` returns the worktree to the commit the integration
// started from, which is the only state a failed integration may leave behind.
export function getIntegrationGit(deps: { exec: ExecService; worktreePath: string }) {
	const git: Git = async (args, timeoutMs = GIT_TIMEOUT_MS) =>
		deps.exec.run('git', ['-C', deps.worktreePath, ...args], { env: networkGitEnv(), timeoutMs });

	async function headSha(): Promise<string | null> {
		const head = await git(['rev-parse', 'HEAD']);

		return head.ok && head.stdout !== '' ? head.stdout : null;
	}

	return {
		headSha,

		// Fetched by explicit refspec: a clone's default refspec may cover only the
		// default branch, and a provider's branch would then never appear.
		async fetchOnto(onto: string): Promise<Step<{ ref: string; sha: string }>> {
			const remote = `origin/${onto}`;
			const fetched = await git(['fetch', 'origin', '--prune', `+refs/heads/${onto}:refs/remotes/${remote}`], NETWORK_TIMEOUT_MS);

			if (!fetched.ok) {
				return { ok: false, detail: `could not fetch ${onto}: ${fetched.reason}` };
			}

			const sha = await git(['rev-parse', remote]);

			return sha.ok ? { ok: true, value: { ref: remote, sha: sha.stdout } } : { ok: false, detail: `${remote} does not resolve: ${sha.reason}` };
		},

		async contains(ref: string): Promise<boolean> {
			return (await git(['merge-base', '--is-ancestor', ref, 'HEAD'])).ok;
		},

		// Every file under a `regenerate` path the branch added or changed since it
		// left `ontoRef` gets `ontoRef`'s copy, or goes when `ontoRef` has none. What
		// is left to merge there is then identical on both sides, and the rule's own
		// command produces it again against what the branch is landing on.
		async takeGenerated(opts: { ontoRef: string; globs: string[] }): Promise<Step<string[]>> {
			if (opts.globs.length === 0) {
				return { ok: true, value: [] };
			}

			const base = await git(['merge-base', 'HEAD', opts.ontoRef]);

			if (!base.ok) {
				return { ok: false, detail: `this branch shares no history with ${opts.ontoRef}` };
			}

			const changed = await git(['diff', '--name-only', base.stdout, 'HEAD', '--', ...globPathspecs(opts.globs)]);

			if (!changed.ok) {
				return { ok: false, detail: changed.reason };
			}

			const files = lines(changed.stdout);

			for (const file of files) {
				const present = (await git(['cat-file', '-e', `${opts.ontoRef}:${file}`])).ok;
				const result = present
					? await git(['checkout', opts.ontoRef, '--', file])
					: await git(['rm', '-q', '--ignore-unmatch', '--', file]);

				if (!result.ok) {
					return { ok: false, detail: `could not take ${opts.ontoRef}'s ${file}: ${result.reason}` };
				}
			}

			if (files.length > 0 && !(await git(['diff', '--cached', '--quiet'])).ok) {
				const committed = await git(['commit', '--no-verify', '-m', `Integrate: take ${opts.ontoRef.replace(/^origin\//, '')}'s generated files`]);

				if (!committed.ok) {
					return { ok: false, detail: `could not commit the generated files: ${committed.reason}` };
				}
			}

			return { ok: true, value: files };
		},

		// Merged rather than rebased: each bullet's sha is recorded against its slice,
		// and a rebase would leave those pointing at commits no branch contains.
		async merge(ontoRef: string): Promise<Step<string[]>> {
			const merged = await git(['merge', '--no-edit', '--no-commit', '--no-ff', ontoRef]);
			const conflicts = lines((await git(['diff', '--name-only', '--diff-filter=U'])).stdout);

			if (!merged.ok && conflicts.length === 0) {
				return { ok: false, detail: `could not merge ${ontoRef}: ${merged.stdout || merged.reason}` };
			}

			return { ok: true, value: conflicts };
		},

		// A generated file that still conflicts takes the target's side; the rule
		// regenerates it next either way.
		async takeTheirs(files: string[]): Promise<Step> {
			for (const file of files) {
				const theirs = await git(['checkout', '--theirs', '--', file]);
				const staged = theirs.ok ? await git(['add', '--', file]) : await git(['rm', '-q', '--ignore-unmatch', '--', file]);

				if (!staged.ok) {
					return { ok: false, detail: `could not take the target's ${file}: ${staged.reason}` };
				}
			}

			return { ok: true };
		},

		// What a session was asked to resolve and did not: a file still holding a
		// conflict marker. Git keeps reporting every one of them unmerged until it is
		// staged, so the index says nothing about whether the session finished.
		async unresolved(files: string[]): Promise<string[]> {
			return files.filter((file) => {
				const absolute = path.join(deps.worktreePath, file);

				return fs.existsSync(absolute) && MARKER.test(fs.readFileSync(absolute, 'utf8'));
			});
		},

		async conflictedUnder(globs: string[]): Promise<string[]> {
			if (globs.length === 0) {
				return [];
			}

			return lines((await git(['diff', '--name-only', '--diff-filter=U', '--', ...globPathspecs(globs)])).stdout);
		},

		// Everything in the tree into the index, bar the env files bosun wrote, so
		// the next command's own changes are the only ones left unstaged.
		async stageAll(keepOut: string[]): Promise<Step> {
			const added = await git(['add', '-A']);

			if (!added.ok) {
				return { ok: false, detail: `could not stage the merge: ${added.reason}` };
			}

			if (keepOut.length > 0) {
				await git(['reset', '-q', '--', ...keepOut]);
			}

			return { ok: true };
		},

		async stage(files: string[]): Promise<Step> {
			for (const file of files) {
				const added = fs.existsSync(path.join(deps.worktreePath, file))
					? await git(['add', '--', file])
					: await git(['rm', '-q', '--ignore-unmatch', '--', file]);

				if (!added.ok) {
					return { ok: false, detail: `could not stage ${file}: ${added.reason}` };
				}
			}

			return { ok: true };
		},

		async diffSince(opts: { from: string; file: string }): Promise<string> {
			const diff = await git(['diff', opts.from, '--', opts.file]);

			return clipDiff(diff.stdout);
		},

		// Files under the given globs a regenerate command just changed: those whose
		// working copy differs from the index, which `stageAll` left matching.
		async changedUnder(globs: string[]): Promise<string[]> {
			const status = await git(['status', '--porcelain', '--untracked-files=all', '--', ...globPathspecs(globs)]);

			return status.stdout
				.split('\n')
				.filter((line) => line.length > 3 && line[1] !== ' ')
				.map((line) => line.slice(3).replace(/^.* -> /, '').trim());
		},

		async mergeInProgress(): Promise<boolean> {
			return (await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).ok;
		},

		async planNumbersTouching(opts: { ontoRef: string; files: string[] }): Promise<number[]> {
			const log = await git(['log', '--format=%s%n%b', `HEAD..${opts.ontoRef}`, '--', ...opts.files]);

			return log.ok ? planNumbersIn(log.stdout) : [];
		},

		async push(branch: string): Promise<Step> {
			const pushed = await git(['push', '-u', 'origin', `HEAD:refs/heads/${branch}`], NETWORK_TIMEOUT_MS);

			return pushed.ok ? { ok: true } : { ok: false, detail: `could not push ${branch}: ${pushed.reason}` };
		},

		// Back to where the integration started, whatever step it stopped at. Nothing
		// half-merged may stay: the next bullet or integration would commit it.
		async abandon(preHead: string): Promise<void> {
			if ((await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).ok) {
				await git(['merge', '--abort']);
			}

			await git(['reset', '--hard', preHead]);
			await git(['clean', '-fd']);
		}
	};
}

export type IntegrationGit = ReturnType<typeof getIntegrationGit>;
