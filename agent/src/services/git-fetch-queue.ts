import { sleep } from '../utils';
import { type ExecResult, type ExecService } from './exec.service';

const RACE_RETRY_MS = 1_000;

// What git says when two fetches update the same remote-tracking ref at once.
const REF_RACE = /incorrect old value provided|cannot lock ref|unable to update local ref/;

function gitSubcommand(args: string[]): string | null {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]!;

		if (arg === '-C' || arg === '-c') {
			index += 1;
		} else if (!arg.startsWith('-')) {
			return arg;
		}
	}

	return null;
}

// Every worktree shares its clone's refs, so two fetches from different worktrees
// race on the same `refs/remotes/origin/*` and one fails with a ref lock error — a
// push to the default branch starts an integration for every plan in review at
// the same instant. Fetches from this process run one at a time; the single retry
// covers a fetch run by a session, which this queue cannot see.
export function withSerializedFetches(exec: ExecService, opts: { retryMs?: number } = {}): ExecService {
	const retryMs = opts.retryMs ?? RACE_RETRY_MS;
	let tail: Promise<unknown> = Promise.resolve();

	const fetch = async (params: Parameters<ExecService['run']>): Promise<ExecResult> => {
		const first = await exec.run(...params);

		if (first.ok || !REF_RACE.test(`${first.stderr}\n${first.reason}`)) {
			return first;
		}

		await sleep(retryMs);

		return exec.run(...params);
	};

	return {
		run(...params: Parameters<ExecService['run']>): Promise<ExecResult> {
			const [command, args] = params;

			if (command !== 'git' || gitSubcommand(args) !== 'fetch') {
				return exec.run(...params);
			}

			const result = tail.then(() => fetch(params));

			tail = result.catch(() => undefined);

			return result;
		}
	};
}
