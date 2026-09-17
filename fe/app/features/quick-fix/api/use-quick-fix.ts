import { notifications } from '@mantine/notifications'
import { useMutation } from '@tanstack/react-query'

import type { QuickFixForm } from '~/features/quick-fix/model/quick-fix-form'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// Fire-and-forget: the fix runs on the machine and the outcome — a PR link or a
// failure reason — arrives as a notification, not from this response.
async function startQuickFix (form: QuickFixForm): Promise<void> {
	await apiClient.post(`/machines/${form.machineId}/quick-fixes`, { description: form.description })
}

export function useQuickFix () {
	return useMutation({
		mutationFn: startQuickFix,
		onSuccess: () => {
			notifications.show({
				color: 'blue',
				title: 'Quick fix started',
				message: 'You’ll get a notification when it pushes a PR or fails.'
			})
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not start the quick fix', error })
		}
	})
}
