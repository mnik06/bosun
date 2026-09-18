import { describe, expect, it } from 'vitest';
import { baseBranchRefusal, pendingBaseBranch } from 'src/controllers/onboarding/shared/base-branch';

const provider = { defaultBranch: 'main', providerDefaultBranch: 'main', defaultBranchOverride: null };
const overridden = { defaultBranch: 'develop', providerDefaultBranch: 'main', defaultBranchOverride: 'develop' };

describe('pendingBaseBranch', () => {
	it('holds verify while a discovery onboarded another branch than the default', () => {
		expect(pendingBaseBranch({ discovery: { suggestedBaseBranch: 'develop' }, repository: provider })).toBe('develop');
	});

	it('lets verify go once the suggestion is the default branch', () => {
		expect(pendingBaseBranch({ discovery: { suggestedBaseBranch: 'develop' }, repository: overridden })).toBeNull();
	});

	it('has nothing pending without a suggestion or a discovery', () => {
		expect(pendingBaseBranch({ discovery: { suggestedBaseBranch: null }, repository: provider })).toBeNull();
		expect(pendingBaseBranch({ discovery: null, repository: provider })).toBeNull();
	});
});

describe('baseBranchRefusal', () => {
	it('refuses an agent that would onboard the provider default over an override', () => {
		expect(baseBranchRefusal({ machine: { agentVersion: '4.0.6' }, repository: overridden })).toContain('would onboard main instead of develop');
		expect(baseBranchRefusal({ machine: { agentVersion: null }, repository: overridden })).not.toBeNull();
	});

	it('lets any agent through when there is no override, and a new enough one when there is', () => {
		expect(baseBranchRefusal({ machine: { agentVersion: '3.0.0' }, repository: provider })).toBeNull();
		expect(baseBranchRefusal({ machine: { agentVersion: '4.0.7' }, repository: overridden })).toBeNull();
	});
});
