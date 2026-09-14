import { Button, Group, Stack, Switch, Text } from '@mantine/core'

import type { Machine } from '~/entities/machine'
import { useSetMachinePolicy } from '~/features/set-machine-policy/api/use-set-machine-policy'

// Per machine and never in the file: whether a database may be migrated is a
// fact about where this box points, not about the code.
export function MachinePolicySwitch ({
	machine,
	why
}: {
	machine: Pick<Machine, 'id' | 'policy'>,
	why: string | null
}) {
	const setPolicy = useSetMachinePolicy(machine.id)
	const policy = machine.policy ?? { applyMigrations: true, confirmed: false }

	// The switch starts in a position nobody chose, and onboarding waits for a
	// decision, so leaving it where it is has to be a step of its own.
	return (
		<Stack gap="xs">
			<Switch
				label="Apply migrations"
				description={`${why === null ? '' : `${why}. `}Off when this machine points at a database bosun must not migrate — sessions then commit migrations and say they are pending.`}
				checked={policy.applyMigrations}
				disabled={setPolicy.isPending}
				onChange={(event) => {
					setPolicy.mutate(event.currentTarget.checked)
				}}
			/>

			{policy.confirmed ? null : (
				<Group gap="sm" wrap="wrap">
					<Button
						size="xs"
						color="yellow"
						loading={setPolicy.isPending}
						onClick={() => {
							setPolicy.mutate(policy.applyMigrations)
						}}
					>
						Confirm
					</Button>
					<Text size="xs" c="yellow.8">
						Not confirmed yet — onboarding waits until you confirm {policy.applyMigrations ? 'applying' : 'not applying'} migrations.
					</Text>
				</Group>
			)}
		</Stack>
	)
}
