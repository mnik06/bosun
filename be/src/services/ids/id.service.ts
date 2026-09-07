import { nanoid } from 'nanoid';

export function createMachineId(): string {
	return `m_${nanoid(12)}`;
}

export function createCommandId(): string {
	return `cmd_${nanoid(12)}`;
}

export function createUserId(): string {
	return `u_${nanoid(12)}`;
}

export function createPlanId(): string {
	return `p_${nanoid(12)}`;
}

export function createPlanMessageId(): string {
	return `pm_${nanoid(12)}`;
}

export function createAcId(): string {
	return `ac_${nanoid(12)}`;
}

export function createSliceId(): string {
	return `sl_${nanoid(12)}`;
}
