import { z } from 'zod'

export const PingMachineRespSchema = z.object({
	commandId: z.string()
})

export type PingMachineResp = z.infer<typeof PingMachineRespSchema>
