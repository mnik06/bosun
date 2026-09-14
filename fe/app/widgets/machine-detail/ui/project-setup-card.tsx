import { Badge, Group, Stack, Text } from '@mantine/core'

import { machineKind, type Machine } from '~/entities/machine'
import { EnvSetsPanel } from '~/features/edit-env-sets'
import { ProjectProfileButton } from '~/features/edit-project-profile'
import { MachinePolicySwitch } from '~/features/set-machine-policy'
import { SetupCard } from '~/widgets/machine-detail/ui/setup-card'

function SessionSecrets ({ names }: { names: string[] }) {
	return (
		<Stack gap="xs">
			<Text size="sm" fw={600}>
				Session secrets
			</Text>
			{names.length === 0 ? (
				<Text size="sm" c="dimmed">
					None yet. Test-account credentials the onboarding asks for land here — put into a session&apos;s
					environment, never written to a file.
				</Text>
			) : (
				<Group gap={4}>
					{names.map((name) => (
						<Badge key={name} size="sm" variant="default" radius="sm" tt="none" className="font-mono">
							{name}
						</Badge>
					))}
				</Group>
			)}
		</Stack>
	)
}

// A machine with a repository describes the code in `.bosun/project.yaml`; what
// is left here is what differs per machine — its services, its secrets, and
// whether it may migrate.
export function ProjectSetupCard ({ machine }: { machine: Machine }) {
	if (machineKind(machine) === 'legacy') {
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

	return (
		<SetupCard
			title="Machine inputs"
			description="What this machine holds that the repository must not: the services it points at, test-account secrets, and whether it may migrate."
			action={null}
		>
			<Stack gap="md">
				<MachinePolicySwitch machine={machine} />
				<SessionSecrets names={machine.sessionSecrets ?? []} />
				<EnvSetsPanel machine={machine} />
			</Stack>
		</SetupCard>
	)
}
