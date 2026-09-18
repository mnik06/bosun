import { useMutation } from '@tanstack/react-query'

import { encodeChatAttachments } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'
import type { ChatComposerMessage } from '~/shared/ui'

// Nothing is invalidated on success: what the session makes of the message
// arrives over the socket, and the message itself is echoed back the same way —
// on the same terms as `useSayToPlan`.
export function useSayToBugfix (planId: string) {
	return useMutation({
		mutationFn: async (message: ChatComposerMessage) => {
			await apiClient.post(`/plans/${planId}/bugfix/messages`, {
				text: message.text,
				attachments: await encodeChatAttachments(message.files)
			})
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not send that', error })
		}
	})
}
