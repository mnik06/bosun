import { nanoid } from 'nanoid';

export function getIdService() {
	return {
		createMachineId: (): string => `m_${nanoid(12)}`,
		createCommandId: (): string => `cmd_${nanoid(12)}`,
		createUserId: (): string => `u_${nanoid(12)}`,
		createPlanId: (): string => `p_${nanoid(12)}`,
		createPlanMessageId: (): string => `pm_${nanoid(12)}`,
		createAcId: (): string => `ac_${nanoid(12)}`,
		createSliceId: (): string => `sl_${nanoid(12)}`
	};
}

export type IdService = ReturnType<typeof getIdService>;
