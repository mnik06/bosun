import { describe, expect, it } from 'vitest';
import { normalizeAzureOrganization } from 'src/types/AzureSchema';

describe('normalizeAzureOrganization', () => {
	it('accepts a bare organization name unchanged', () => {
		expect(normalizeAzureOrganization('my-org')).toBe('my-org');
	});

	it('reduces a dev.azure.com URL to the org slug', () => {
		expect(normalizeAzureOrganization('https://dev.azure.com/my-org')).toBe('my-org');
		expect(normalizeAzureOrganization('https://dev.azure.com/my-org/')).toBe('my-org');
	});

	it('reduces the legacy visualstudio.com URL to the org slug', () => {
		expect(normalizeAzureOrganization('https://my-org.visualstudio.com')).toBe('my-org');
	});

	it('rejects a value matching none of the three accepted forms', () => {
		expect(normalizeAzureOrganization('')).toBeNull();
		expect(normalizeAzureOrganization('not a valid org!')).toBeNull();
		expect(normalizeAzureOrganization('https://dev.azure.com/my-org/extra/path')).toBeNull();
		expect(normalizeAzureOrganization('https://github.com/my-org')).toBeNull();
	});
});
