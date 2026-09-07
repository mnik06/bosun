import { useQuery } from '@tanstack/react-query'

import { McpPresetListSchema, type McpPreset } from '~/entities/mcp-preset/model/mcp-preset'
import { apiClient } from '~/shared/api'

export const mcpPresetKeys = {
	all: ['mcp-presets'] as const,
	list: () => [...mcpPresetKeys.all, 'list'] as const
}

export async function fetchMcpPresets (): Promise<McpPreset[]> {
	const { data } = await apiClient.get<unknown>('/mcp-presets')

	return McpPresetListSchema.parse(data)
}

export function useMcpPresetsQuery ({ enabled }: { enabled: boolean }) {
	return useQuery({
		queryKey: mcpPresetKeys.list(),
		queryFn: fetchMcpPresets,
		enabled
	})
}
