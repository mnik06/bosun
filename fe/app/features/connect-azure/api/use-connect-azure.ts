import { useMutation, useQueryClient } from '@tanstack/react-query'

import { AzureConnectionSchema, repositoryKeys, type AzureConnection } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export interface AzureConnectionInput {
	organization: string
	pat: string
}

// Errors are left on the mutation rather than toasted: the modal renders the
// specific rejection inline and keeps what was typed (AC-24), which a toast that
// disappears in a few seconds cannot do.
export function useConnectAzureOrganization () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: AzureConnectionInput): Promise<AzureConnection> => {
			const { data } = await apiClient.post<unknown>('/azure/connections', input)

			return AzureConnectionSchema.parse(data)
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: repositoryKeys.azureConnections() }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.availableAzure() })
			])
		}
	})
}

export function useRotateAzureConnection (id: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (pat: string): Promise<AzureConnection> => {
			const { data } = await apiClient.put<unknown>(`/azure/connections/${id}`, { pat })

			return AzureConnectionSchema.parse(data)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: repositoryKeys.azureConnections() })
	})
}

export function useDisconnectAzureConnection () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (id: string): Promise<void> => {
			await apiClient.delete(`/azure/connections/${id}`)
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: repositoryKeys.azureConnections() }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.availableAzure() }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.list() })
			])
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not disconnect the organization', error })
		}
	})
}
