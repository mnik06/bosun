import type { Machine } from '~/entities/machine'
import { useMachineOnboardingQuery, useRepositoriesQuery } from '~/entities/repository'
import { setupChecklist, type ChecklistRow } from '~/widgets/setup-checklist/lib/checklist'

export function useChecklist (machine: Machine): ChecklistRow[] {
	const repositories = useRepositoriesQuery()
	const onboarding = useMachineOnboardingQuery({
		machineId: machine.id,
		enabled: machine.repositoryId != null
	})
	const repository = repositories.data?.find((entry) => entry.id === machine.repositoryId) ?? null

	return setupChecklist({ machine, repository, onboarding: onboarding.data ?? null })
}
