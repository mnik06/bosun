import { nanoid } from 'nanoid';

export function createMachineId(): string {
	return `m_${nanoid(12)}`;
}

export function createCommandId(): string {
	return `cmd_${nanoid(12)}`;
}
