import type { Machine } from '~/entities/machine'
import { EnvSetsPanel } from '~/features/edit-env-sets'
import { ProjectProfileButton } from '~/features/edit-project-profile'
import { SetupCard } from '~/widgets/machine-detail/ui/setup-card'

// Only for a machine enrolled before repositories. A repository machine describes
// its code in `.bosun/project.yaml`, and the inputs that differ per machine are
// raised by onboarding and filled in on its tab — a second place to edit them
// would be a second answer to what the machine still needs.
export function ProjectSetupCard ({ machine }: { machine: Machine }) {
	return (
		<SetupCard
			title="Project setup"
			description="What a session cannot work out by reading the repository — migrations, the commands to run it, where the test credentials live."
			action={<ProjectProfileButton machine={machine} />}
		>
			<EnvSetsPanel machine={machine} />
		</SetupCard>
	)
}
