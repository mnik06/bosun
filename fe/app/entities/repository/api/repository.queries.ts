import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { z } from 'zod'

import {
	AvailableAzureRepositorySchema,
	AvailableRepositorySchema,
	AzureConnectionSchema,
	GithubInstallationSchema,
	GithubPatConnectionSchema,
	MachineOnboardingSchema,
	RepositoryConfigSchema,
	RepositoryMessageSchema,
	RepositorySchema,
	type AvailableAzureRepository,
	type AvailableRepository,
	type AzureConnection,
	type GithubInstallation,
	type GithubPatConnection,
	type MachineOnboarding,
	type Repository,
	type RepositoryConfig,
	type RepositoryMessage
} from '~/entities/repository/model/repository'
import { apiClient, getActiveProjectId } from '~/shared/api'

export const repositoryKeys = {
	all: () => ['repositories', getActiveProjectId()] as const,
	list: () => [...repositoryKeys.all(), 'list'] as const,
	installations: () => [...repositoryKeys.all(), 'installations'] as const,
	patConnections: () => [...repositoryKeys.all(), 'pat-connections'] as const,
	available: () => [...repositoryKeys.all(), 'available'] as const,
	azureConnections: () => [...repositoryKeys.all(), 'azure-connections'] as const,
	availableAzure: () => [...repositoryKeys.all(), 'available-azure'] as const,
	config: (repositoryId: string) => [...repositoryKeys.all(), 'config', repositoryId] as const,
	onboarding: () => [...repositoryKeys.all(), 'onboarding'] as const,
	machineOnboarding: (machineId: string) => [...repositoryKeys.onboarding(), 'machine', machineId] as const,
	messages: (repositoryId: string) => [...repositoryKeys.all(), 'messages', repositoryId] as const
}

export async function fetchRepositoryMessages (repositoryId: string): Promise<RepositoryMessage[]> {
	const { data } = await apiClient.get<unknown>(`/repositories/${repositoryId}/messages`)

	return z.array(RepositoryMessageSchema).parse(data)
}

export function useRepositoryMessagesQuery (repositoryId: string | null) {
	return useQuery({
		queryKey: repositoryKeys.messages(repositoryId ?? ''),
		queryFn: async () => fetchRepositoryMessages(repositoryId ?? ''),
		enabled: repositoryId !== null
	})
}

export async function fetchRepositories (): Promise<Repository[]> {
	const { data } = await apiClient.get<unknown>('/repositories')

	return z.array(RepositorySchema).parse(data)
}

export async function fetchGithubInstallations (): Promise<GithubInstallation[]> {
	const { data } = await apiClient.get<unknown>('/github/installations')

	return z.array(GithubInstallationSchema).parse(data)
}

export async function fetchGithubPatConnections (): Promise<GithubPatConnection[]> {
	const { data } = await apiClient.get<unknown>('/github/pat-connections')

	return z.array(GithubPatConnectionSchema).parse(data)
}

export async function fetchAvailableRepositories (): Promise<AvailableRepository[]> {
	const { data } = await apiClient.get<unknown>('/github/repositories')

	return z.array(AvailableRepositorySchema).parse(data)
}

export async function fetchAzureConnections (): Promise<AzureConnection[]> {
	const { data } = await apiClient.get<unknown>('/azure/connections')

	return z.array(AzureConnectionSchema).parse(data)
}

export async function fetchAvailableAzureRepositories (): Promise<AvailableAzureRepository[]> {
	const { data } = await apiClient.get<unknown>('/azure/repositories')

	return z.array(AvailableAzureRepositorySchema).parse(data)
}

export async function fetchRepositoryConfig (repositoryId: string): Promise<RepositoryConfig> {
	const { data } = await apiClient.get<unknown>(`/repositories/${repositoryId}/config`)

	return RepositoryConfigSchema.parse(data)
}

// A machine that has never been onboarded answers 404, which is a state the
// checklist renders rather than an error it reports.
export async function fetchMachineOnboarding (machineId: string): Promise<MachineOnboarding | null> {
	try {
		const { data } = await apiClient.get<unknown>(`/machines/${machineId}/onboarding`)

		return MachineOnboardingSchema.parse(data)
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 404) {
			return null
		}

		throw error
	}
}

export function useRepositoriesQuery () {
	return useQuery({
		queryKey: repositoryKeys.list(),
		queryFn: fetchRepositories
	})
}

export function useGithubInstallationsQuery () {
	return useQuery({
		queryKey: repositoryKeys.installations(),
		queryFn: fetchGithubInstallations
	})
}

export function useGithubPatConnectionsQuery () {
	return useQuery({
		queryKey: repositoryKeys.patConnections(),
		queryFn: fetchGithubPatConnections
	})
}

export function useAvailableRepositoriesQuery (opts: { enabled: boolean }) {
	return useQuery({
		queryKey: repositoryKeys.available(),
		queryFn: fetchAvailableRepositories,
		enabled: opts.enabled
	})
}

export function useAzureConnectionsQuery () {
	return useQuery({
		queryKey: repositoryKeys.azureConnections(),
		queryFn: fetchAzureConnections
	})
}

export function useAvailableAzureRepositoriesQuery (opts: { enabled: boolean }) {
	return useQuery({
		queryKey: repositoryKeys.availableAzure(),
		queryFn: fetchAvailableAzureRepositories,
		enabled: opts.enabled
	})
}

export function useRepositoryConfigQuery (repositoryId: string) {
	return useQuery({
		queryKey: repositoryKeys.config(repositoryId),
		queryFn: async () => fetchRepositoryConfig(repositoryId)
	})
}

export function useMachineOnboardingQuery (opts: { machineId: string, enabled: boolean }) {
	return useQuery({
		queryKey: repositoryKeys.machineOnboarding(opts.machineId),
		queryFn: async () => fetchMachineOnboarding(opts.machineId),
		enabled: opts.enabled
	})
}
