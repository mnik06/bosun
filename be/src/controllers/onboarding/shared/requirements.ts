import { HttpError } from 'src/api/errors/HttpError';
import { type Machine } from 'src/types/MachineSchema';
import { isOptionalRequirement, type OnboardingRequirement } from 'src/types/OnboardingSchema';
import { normalizeEnvPath } from 'src/utils/env-path';

// Decided from what bosun already holds about the machine — key names and the
// policy — never from a value. It is the one rule both the inputs form and the
// automatic start of verify read, so the form cannot say "done" while verify
// waits, or the other way round.
export function missingRequirements(opts: {
	requirements: OnboardingRequirement[];
	machine: Machine;
}): OnboardingRequirement[] {
	const envKeys = new Map(
		(opts.machine.envSets ?? []).map((set) => [set.path, new Set(set.keys)])
	);
	const secrets = new Set(opts.machine.sessionSecrets ?? []);

	return opts.requirements.filter((requirement) => {
		if (isOptionalRequirement(requirement)) {
			return false;
		}

		if (requirement.kind === 'policy') {
			return !opts.machine.policy.confirmed;
		}

		if (requirement.kind === 'secret') {
			return !secrets.has(requirement.key);
		}

		const path = normalizeEnvPath(requirement.path ?? '.');

		return path === null || !envKeys.get(path)?.has(requirement.key);
	});
}

// Stored in the form the machine's env-set summaries use. The browser matches a
// required key against what the machine holds by path, and a save replaces a
// path's whole set — so `./be` against `be` would send a set that erases every
// value already stored under `be`.
export function normalizedRequirement(requirement: OnboardingRequirement): OnboardingRequirement {
	if (requirement.kind !== 'env') {
		return { ...requirement, path: null };
	}

	const path = normalizeEnvPath(requirement.path ?? '');

	if (path === null) {
		throw new HttpError(400, `invalid path ${JSON.stringify((requirement.path ?? '').slice(0, 200))}`);
	}

	return { ...requirement, path };
}
