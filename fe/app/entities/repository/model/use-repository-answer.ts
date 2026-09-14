import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { z } from 'zod'

import { repositoryKeys } from '~/entities/repository/api/repository.queries'
import { RepositoryMessageSchema } from '~/entities/repository/model/repository'
import { subscribeToUiSocket } from '~/shared/api'

const RepositoryChatMsgSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('repository.answer'),
		repositoryId: z.string(),
		askId: z.string(),
		delta: z.string()
	}),
	z.object({ type: z.literal('repository.message'), message: RepositoryMessageSchema })
])

// The streamed half of an answer, dropped once the stored message arrives — the
// stream is what the session is saying, the message is what was kept.
export function useRepositoryAnswer (repositoryId: string | null): string | null {
	const queryClient = useQueryClient()
	const [streams, setStreams] = useState<Record<string, string>>({})

	useEffect(() => {
		return subscribeToUiSocket({
			onMessage: (raw) => {
				const parsed = RepositoryChatMsgSchema.safeParse(raw)

				if (!parsed.success) {
					return
				}

				if (parsed.data.type === 'repository.answer') {
					const { repositoryId: id, delta } = parsed.data

					setStreams((previous) => ({ ...previous, [id]: `${previous[id] ?? ''}${delta}` }))

					return
				}

				const { message } = parsed.data

				setStreams((previous) => {
					const { [message.repositoryId]: _dropped, ...rest } = previous

					return rest
				})
				void queryClient.invalidateQueries({ queryKey: repositoryKeys.messages(message.repositoryId) })
			}
		})
	}, [queryClient])

	return repositoryId === null ? null : streams[repositoryId] ?? null
}
