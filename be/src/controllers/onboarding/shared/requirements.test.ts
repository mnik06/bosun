import { describe, expect, it } from 'vitest';
import { missingRequirements, normalizedRequirement } from 'src/controllers/onboarding/shared/requirements';
import { type Machine } from 'src/types/MachineSchema';
import { type OnboardingRequirement } from 'src/types/OnboardingSchema';

function machine(overrides: Partial<Machine>): Machine {
	return {
		id: 'm_1',
		projectId: 'prj_1',
		name: 'vps',
		status: 'online',
		lastSeenAt: null,
		repoPath: null,
		agentVersion: '3.0.0',
		projectProfile: null,
		capabilities: null,
		envSets: null,
		repositoryId: 'repo_1',
		publicKey: 'key',
		policy: { applyMigrations: true, confirmed: false },
		sessionSecrets: null,
		createdAt: new Date(),
		...overrides
	};
}

const env = (path: string, key: string): OnboardingRequirement => ({ kind: 'env', path, key, why: 'w', evidence: 'e' });
const secret = (key: string): OnboardingRequirement => ({ kind: 'secret', path: null, key, why: 'w', evidence: 'e' });
const policy: OnboardingRequirement = { kind: 'policy', path: null, key: 'applyMigrations', why: 'w', evidence: 'e' };

describe('missingRequirements', () => {
	// Verify starts on its own the moment this is empty, so a key counted under the
	// wrong path starts a verify with no database behind it.
	it('matches env keys by normalized path', () => {
		const held = machine({ envSets: [{ path: 'be', keys: ['DATABASE_URL'], updatedAt: '' }] });

		expect(missingRequirements({ requirements: [env('./be/', 'DATABASE_URL'), env('fe', 'DATABASE_URL')], machine: held })).toEqual([
			env('fe', 'DATABASE_URL')
		]);
	});

	it('treats the root path and "." as the same set', () => {
		const held = machine({ envSets: [{ path: '.', keys: ['TOKEN'], updatedAt: '' }] });

		expect(missingRequirements({ requirements: [env('', 'TOKEN')], machine: held })).toEqual([]);
	});

	it('needs a session secret by name and the policy by an explicit choice', () => {
		const requirements = [secret('TEST_LEADER_PASSWORD'), policy];

		expect(missingRequirements({ requirements, machine: machine({}) })).toEqual(requirements);
		expect(
			missingRequirements({
				requirements,
				machine: machine({ sessionSecrets: ['TEST_LEADER_PASSWORD'], policy: { applyMigrations: false, confirmed: true } })
			})
		).toEqual([]);
	});
});

describe('normalizedRequirement', () => {
	// The browser saves a path's whole set; a requirement stored under `./be` would
	// be matched against no stored set and saved as one that erases `be`'s values.
	it('stores an env path the way the machine reports its sets', () => {
		expect(normalizedRequirement(env('./be/', 'DATABASE_URL')).path).toBe('be');
		expect(normalizedRequirement(env('', 'TOKEN')).path).toBe('.');
	});

	it('refuses a path that climbs out of the repository', () => {
		expect(() => normalizedRequirement(env('../be', 'X'))).toThrow('invalid path');
	});
});
