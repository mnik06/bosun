import { useQuery } from '@tanstack/react-query'

import {
	ProjectListSchema,
	ProjectMemberListSchema,
	type Project,
	type ProjectMember
} from '~/entities/project/model/project'
import { apiClient } from '~/shared/api'

export const projectKeys = {
	all: ['projects'] as const,
	list: () => [...projectKeys.all, 'list'] as const,
	members: (projectId: string) => [...projectKeys.all, projectId, 'members'] as const
}

export async function fetchProjects (): Promise<Project[]> {
	const { data } = await apiClient.get<unknown>('/projects')

	return ProjectListSchema.parse(data)
}

export async function fetchProjectMembers (projectId: string): Promise<ProjectMember[]> {
	const { data } = await apiClient.get<unknown>(`/projects/${projectId}/members`)

	return ProjectMemberListSchema.parse(data)
}

export function useProjectsQuery () {
	return useQuery({
		queryKey: projectKeys.list(),
		queryFn: fetchProjects
	})
}

export function useProjectMembersQuery (projectId: string | null) {
	return useQuery({
		queryKey: projectKeys.members(projectId ?? ''),
		queryFn: async () => fetchProjectMembers(projectId ?? ''),
		enabled: projectId !== null
	})
}
