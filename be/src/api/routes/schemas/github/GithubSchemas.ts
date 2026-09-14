import { z } from 'zod';
import { AvailableRepositorySchema, GithubInstallationSchema } from 'src/types/RepositorySchema';

export const InstallUrlRespSchema = z.object({ url: z.url(), authorizeUrl: z.url() });

export const ImportInstallationsReqSchema = z.object({
	code: z.string().min(1).max(200),
	state: z.string().min(1).max(1000)
});

export const ConnectInstallationReqSchema = z.object({
	installationId: z.number().int().positive(),
	code: z.string().min(1).max(200),
	state: z.string().min(1).max(1000)
});

export const InstallationRespSchema = z.object({ installation: GithubInstallationSchema });

export const InstallationListRespSchema = z.array(GithubInstallationSchema);

export const AvailableRepositoryListRespSchema = z.array(AvailableRepositorySchema);
