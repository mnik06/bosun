import crypto from 'crypto';
import { HttpError } from 'src/api/errors/HttpError';

const BEARER_PREFIX = 'Bearer ';

export function readBearerToken(authorization?: string): string | null {
	if (!authorization?.startsWith(BEARER_PREFIX)) {
		return null;
	}

	return authorization.slice(BEARER_PREFIX.length).trim() || null;
}

// Numeric by dotted part; a pre-release suffix is ignored. Enough to ask "is this
// agent at least the release that shipped a feature".
export function compareVersions(a: string, b: string): number {
	const parts = (version: string) => version.replace(/^v/, '').split('-')[0]!.split('.').map((part) => Number(part) || 0);
	const [left, right] = [parts(a), parts(b)];

	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);

		if (difference !== 0) {
			return Math.sign(difference);
		}
	}

	return 0;
}

// 404 rather than a bare undefined: a repo's "owned by this project" lookup
// answering nothing means either the row does not exist or it belongs to someone
// else, and both are reported the same way so guessing an id cannot be used to
// find out which.
export async function orNotFound<T>(promise: Promise<T | null | undefined>, message: string): Promise<T> {
	const row = await promise;

	if (!row) {
		throw new HttpError(404, message);
	}

	return row;
}

export function clip(text: string, max: number): string {
	const trimmed = text.trim();

	return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export function countLabel(count: number, singular: string): string {
	return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function hexDigestsEqual(a: string, b: string): boolean {
	const left = Buffer.from(a, 'hex');
	const right = Buffer.from(b, 'hex');

	if (left.length !== right.length) {
		return false;
	}

	return crypto.timingSafeEqual(left, right);
}

export function findDuplicate(values: string[]): string | null {
	const seen = new Set<string>();

	for (const value of values) {
		if (seen.has(value)) {
			return value;
		}

		seen.add(value);
	}

	return null;
}

// A process-local Retry-After cooldown keyed by connection id, shared by every
// provider whose rate-limit error carries its own retry hint — it does not need
// to survive a restart, only to stop one connection's calls for the window the
// provider itself named, without touching any other.
export function createRateLimitCooldownGuard(opts: { retryAfterMs: (error: unknown) => number | undefined }) {
	const rateLimitedUntil = new Map<string, number>();

	return {
		isRateLimited(connectionId: string): boolean {
			const until = rateLimitedUntil.get(connectionId);

			return until !== undefined && until > Date.now();
		},

		// Runs `run`, and if it fails with a rate-limited error, remembers the
		// cooldown before letting the error through — the caller still sees the
		// failure, only the next call to this connection is what gets short-circuited.
		async run<T>(connectionId: string, run: () => Promise<T>): Promise<T> {
			try {
				return await run();
			} catch (error) {
				const retryAfterMs = opts.retryAfterMs(error);

				if (retryAfterMs !== undefined) {
					rateLimitedUntil.set(connectionId, Date.now() + retryAfterMs);
				}

				throw error;
			}
		}
	};
}

// The identical diff every branch-head poller runs: every branch whose sha
// changed since the last poll, empty when there is no previous snapshot to
// compare against (the first poll after attach).
export function diffBranchHeads(previous: Map<string, string> | undefined, current: Map<string, string>): { branch: string; sha: string }[] {
	if (!previous) {
		return [];
	}

	const changed: { branch: string; sha: string }[] = [];

	for (const [branch, sha] of current) {
		if (previous.get(branch) !== sha) {
			changed.push({ branch, sha });
		}
	}

	return changed;
}
