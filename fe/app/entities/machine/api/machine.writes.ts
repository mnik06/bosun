import type { SealedVar } from '~/entities/machine/lib/seal-vars'
import { MachineSchema, type Machine } from '~/entities/machine/model/machine'
import { apiClient } from '~/shared/api'

export async function putEnvSet (opts: {
	machineId: string,
	path: string,
	vars: SealedVar[]
}): Promise<Machine> {
	const { data } = await apiClient.put<unknown>(`/machines/${opts.machineId}/env-sets`, {
		path: opts.path,
		vars: opts.vars
	})

	return MachineSchema.parse(data)
}

export async function putSessionSecrets (opts: { machineId: string, vars: SealedVar[] }): Promise<Machine> {
	const { data } = await apiClient.put<unknown>(`/machines/${opts.machineId}/session-secrets`, {
		vars: opts.vars
	})

	return MachineSchema.parse(data)
}

export async function patchMachineCapacity (opts: {
	machineId: string,
	verifyLanes?: number,
	buildCap?: number | null,
	ignoreMemoryBudget?: boolean
}): Promise<Machine> {
	const { machineId, ...body } = opts
	const { data } = await apiClient.patch<unknown>(`/machines/${machineId}`, body)

	return MachineSchema.parse(data)
}

export async function putMachinePolicy (opts: {
	machineId: string,
	applyMigrations: boolean
}): Promise<Machine> {
	const { data } = await apiClient.put<unknown>(`/machines/${opts.machineId}/policy`, {
		applyMigrations: opts.applyMigrations
	})

	return MachineSchema.parse(data)
}
