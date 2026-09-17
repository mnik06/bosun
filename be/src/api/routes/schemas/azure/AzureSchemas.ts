import { z } from 'zod';
import { AvailableAzureRepositorySchema, AzureConnectionSchema } from 'src/types/AzureSchema';

export const AzureConnectionIdParamsSchema = z.object({ id: z.string().min(1) });

export const ConnectAzureOrganizationReqSchema = z.object({
	organization: z.string().min(1).max(200),
	pat: z.string().min(1).max(2000)
});

export const RotateAzureConnectionReqSchema = z.object({ pat: z.string().min(1).max(2000) });

export const AzureConnectionRespSchema = AzureConnectionSchema;

export const AzureConnectionListRespSchema = z.array(AzureConnectionSchema);

export const AvailableAzureRepositoryListRespSchema = z.array(AvailableAzureRepositorySchema);
