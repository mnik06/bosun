import { useQuery } from '@tanstack/react-query'

import {
	LineSchema,
	NeedsYouListSchema,
	type Line,
	type NeedsYouItem
} from '~/entities/plan/model/line'
import { apiClient, getActiveProjectId } from '~/shared/api'

export const lineKeys = {
	all: () => ['line', getActiveProjectId()] as const,
	list: (repositoryId: string | null) => [...lineKeys.all(), repositoryId ?? 'project'] as const
}

export const needsYouKeys = {
	all: () => ['needs-you', getActiveProjectId()] as const
}

export async function fetchLine (repositoryId: string | null): Promise<Line> {
	const { data } = await apiClient.get<unknown>('/line', {
		params: repositoryId === null ? undefined : { repositoryId }
	})

	return LineSchema.parse(data)
}

export async function fetchNeedsYou (): Promise<NeedsYouItem[]> {
	const { data } = await apiClient.get<unknown>('/needs-you')

	return NeedsYouListSchema.parse(data)
}

export function useLineQuery (repositoryId: string | null = null) {
	return useQuery({
		queryKey: lineKeys.list(repositoryId),
		queryFn: async () => fetchLine(repositoryId)
	})
}

export function useNeedsYouQuery () {
	return useQuery({ queryKey: needsYouKeys.all(), queryFn: fetchNeedsYou })
}
