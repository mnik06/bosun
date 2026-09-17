import { describe, expect, it, vi } from 'vitest';
import { connectAzureOrganization } from 'src/controllers/azure/connect-organization';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { AzureError, type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type IdService } from 'src/services/ids/id.service';

function build(opts: { existing?: boolean; repositories?: unknown[]; listError?: AzureError }) {
	const create = vi.fn().mockImplementation(async (row) => ({ ...row, status: 'active', lastError: null, brokenAt: null, createdAt: new Date() }));
	const azureConnectionRepo = {
		getByOrganization: vi.fn().mockResolvedValue(opts.existing ? { id: 'azc_1' } : null),
		create
	};
	const azureDevOps = {
		listRepositories: opts.listError
			? vi.fn().mockRejectedValue(opts.listError)
			: vi.fn().mockResolvedValue(opts.repositories ?? [{ fullName: 'org/proj/repo' }])
	};
	const patEncryption = { encrypt: vi.fn((pat: string) => `encrypted:${pat}`) };

	return {
		create,
		listRepositories: azureDevOps.listRepositories,
		run: (organization: string) =>
			connectAzureOrganization({
				azureConnectionRepo: azureConnectionRepo as unknown as AzureConnectionRepo,
				azureDevOps: azureDevOps as unknown as AzureDevOpsService,
				patEncryption: patEncryption as unknown as PatEncryptionService,
				idService: { createAzureConnectionId: () => 'azc_new' } as unknown as IdService,
				userId: 'u_1',
				projectId: 'prj_1',
				organization,
				pat: 'the-pat'
			})
	};
}

describe('connectAzureOrganization', () => {
	it('rejects an organization matching none of the accepted forms before calling Azure', async () => {
		const { run, listRepositories } = build({});

		await expect(run('not a valid org!')).rejects.toMatchObject({ statusCode: 400 });
		expect(listRepositories).not.toHaveBeenCalled();
	});

	it('refuses an organization already connected on this project', async () => {
		const { run, listRepositories } = build({ existing: true });

		await expect(run('my-org')).rejects.toThrow('This organization is already connected.');
		expect(listRepositories).not.toHaveBeenCalled();
	});

	it('surfaces a distinct message for an invalid token rather than a generic failure', async () => {
		const { run } = build({ listError: new AzureError('invalid_token', 'This token is invalid or expired.') });

		await expect(run('my-org')).rejects.toThrow('This token is invalid or expired.');
	});

	it('refuses a token that sees no repositories, without saving it', async () => {
		const { run, create } = build({ repositories: [] });

		await expect(run('my-org')).rejects.toThrow('No repositories are visible to this token');
		expect(create).not.toHaveBeenCalled();
	});

	it('normalizes a dev.azure.com URL and stores the encrypted PAT', async () => {
		const { run, create } = build({});

		await run('https://dev.azure.com/my-org');

		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({ organization: 'my-org', encryptedPat: 'encrypted:the-pat', createdByUserId: 'u_1' })
		);
	});
});
