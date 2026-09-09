import { nanoid } from 'nanoid';

export function getIdService() {
	return {
		createMachineId: (): string => `m_${nanoid(12)}`,
		createCommandId: (): string => `cmd_${nanoid(12)}`,
		createUserId: (): string => `u_${nanoid(12)}`,
		createProjectId: (): string => `prj_${nanoid(12)}`,
		createPlanId: (): string => `p_${nanoid(12)}`,
		createPlanMessageId: (): string => `pm_${nanoid(12)}`,
		createAcId: (): string => `ac_${nanoid(12)}`,
		createSliceId: (): string => `sl_${nanoid(12)}`,
		createQueueId: (): string => `q_${nanoid(12)}`,
		createQueueMessageId: (): string => `qm_${nanoid(12)}`,
		createQueueItemId: (): string => `qi_${nanoid(12)}`,
		createPlanDecisionId: (): string => `pd_${nanoid(12)}`,
		createSliceRunId: (): string => `sr_${nanoid(12)}`
	};
}

export type IdService = ReturnType<typeof getIdService>;
