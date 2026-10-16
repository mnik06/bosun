import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { RepositorySchema, repositoryKeys } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const SavedSchema = z.object({
	repository: RepositorySchema,
	regeneration: z.discriminatedUnion('started', [
		z.object({ started: z.literal(true) }),
		z.object({ started: z.literal(false), reason: z.string() })
	])
})

type Saved = z.infer<typeof SavedSchema>

export function useSaveInstructions (repositoryId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (text: string): Promise<Saved> => {
			const { data } = await apiClient.put<unknown>(`/repositories/${repositoryId}/instructions`, { text })

			return SavedSchema.parse(data)
		},
		onSuccess: async ({ regeneration }) => {
			notifications.show(
				regeneration.started
					? { color: 'green', title: 'Saved', message: 'Bosun is regenerating the config.' }
					: { color: 'yellow', title: 'Saved — the config was not regenerated', message: `${regeneration.reason}.` }
			)
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: repositoryKeys.list() }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.config(repositoryId) }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.onboarding() })
			])
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not save the instructions', error })
		}
	})
}
