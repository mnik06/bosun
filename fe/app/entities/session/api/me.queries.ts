import { useQuery } from '@tanstack/react-query'

import { apiClient } from '~/shared/api'
import { MeSchema, type Me } from '~/entities/session/model/session'

export const meKeys = {
	all: ['me'] as const
}

export async function fetchMe (): Promise<Me> {
	const { data } = await apiClient.get<unknown>('/me')

	return MeSchema.parse(data)
}

export function useMeQuery () {
	return useQuery({
		queryKey: meKeys.all,
		queryFn: fetchMe
	})
}
