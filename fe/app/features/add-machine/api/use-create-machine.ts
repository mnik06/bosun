import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'

import { machineKeys } from '~/entities/machine'
import {
	CreatedMachineSchema,
	type AddMachineForm,
	type CreatedMachine
} from '~/features/add-machine/model/add-machine'
import { apiClient } from '~/shared/api'
import { toErrorMessage } from '~/shared/lib'

async function createMachine (form: AddMachineForm): Promise<CreatedMachine> {
	const { data } = await apiClient.post<unknown>('/machines', form)

	return CreatedMachineSchema.parse(data)
}

export function useCreateMachine () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: createMachine,
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: machineKeys.list() }),
		onError: (error: unknown) => {
			notifications.show({
				color: 'red',
				title: 'Could not add machine',
				message: toErrorMessage(error, 'Unknown error')
			})
		}
	})
}
