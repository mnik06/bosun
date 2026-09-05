import { notifications } from '@mantine/notifications'
import { useMutation } from '@tanstack/react-query'

import {
	PingMachineRespSchema,
	type PingMachineResp
} from '~/features/ping-machine/model/ping-machine'
import { apiClient } from '~/shared/api'
import { toErrorMessage } from '~/shared/lib'

export function usePingMachine (machineId: string) {
	return useMutation({
		mutationFn: async (): Promise<PingMachineResp> => {
			const { data } = await apiClient.post<unknown>(`/machines/${machineId}/ping`)

			return PingMachineRespSchema.parse(data)
		},
		onError: (error: unknown) => {
			notifications.show({
				color: 'red',
				title: 'Ping failed',
				message: toErrorMessage(error, 'Unknown error')
			})
		}
	})
}
