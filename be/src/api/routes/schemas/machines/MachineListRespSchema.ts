import { z } from 'zod';
import { MachineSchema } from 'src/types/MachineSchema';

export const MachineListRespSchema = z.array(MachineSchema);

export type MachineListResp = z.infer<typeof MachineListRespSchema>;
