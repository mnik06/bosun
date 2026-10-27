import { Select } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useMachinesQuery } from '~/entities/machine'
import { patchPlan, PlanSchema, type PlanDetail } from '~/entities/plan'
import { planMovable } from '~/features/move-plan/lib/movable'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function PlanMachineSelect ({ detail }: { detail: Pick<PlanDetail, 'plan' | 'build'> }) {
	const { plan } = detail
	const queryClient = useQueryClient()
	const machines = useMachinesQuery()
	const move = useMutation({
		mutationFn: async (machineId: string) => {
			const { data } = await apiClient.put<unknown>(`/plans/${plan.id}/machine`, { machineId })

			return PlanSchema.parse(data)
		},
		onSuccess: (updated) => {
			patchPlan(queryClient, updated)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not move the plan', error })
		}
	})

	if (!planMovable(detail)) {
		return null
	}

	// Offline machines stay offered: the plan waits in the line for its machine either way.
	const options = (machines.data ?? [])
		.filter((machine) => machine.repositoryId === plan.repositoryId)
		.map((machine) => ({
			value: machine.id,
			label: machine.status === 'online' ? machine.name : `${machine.name} (${machine.status})`
		}))

	return (
		<Select
			aria-label="Machine"
			size="xs"
			w={180}
			data={options}
			value={move.isPending ? move.variables : plan.machineId}
			allowDeselect={false}
			disabled={move.isPending}
			onChange={(machineId) => {
				if (machineId !== null && machineId !== plan.machineId) {
					move.mutate(machineId)
				}
			}}
		/>
	)
}
