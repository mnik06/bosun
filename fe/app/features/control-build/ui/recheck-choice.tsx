import { Button, Group, Stack, Text } from '@mantine/core'
import { CheckCheck, Wrench } from 'lucide-react'

import { useControlBuild } from '~/features/control-build/api/use-control-build'
import { BuildActionButton } from '~/features/control-build/ui/build-action'

// Never automatic: a fix-and-re-check loop nobody chose is how a verify runs all
// afternoon, so a criterion that still fails waits here for a person.
export function RecheckChoice ({ buildId, failing }: { buildId: string, failing: string[] }) {
	const mutation = useControlBuild(buildId)
	const fixing = mutation.isPending && mutation.variables === 'fix-again'
	const accepting = mutation.isPending && mutation.variables === 'accept-gaps'

	return (
		<Stack gap="xs">
			<Text size="sm">
				{failing.length === 0 ? 'A criterion' : failing.join(', ')} still failed after the fix was
				driven again.
			</Text>

			<Group gap="xs">
				<Button
					size="compact-sm"
					leftSection={<Wrench size={14} />}
					loading={fixing}
					disabled={mutation.isPending}
					onClick={() => {
						mutation.mutate('fix-again')
					}}
				>
					Fix again
				</Button>
				<Button
					size="compact-sm"
					variant="light"
					color="orange"
					leftSection={<CheckCheck size={14} />}
					loading={accepting}
					disabled={mutation.isPending}
					onClick={() => {
						mutation.mutate('accept-gaps')
					}}
				>
					Accept as a known gap
				</Button>
				<BuildActionButton buildId={buildId} control="cancel" />
			</Group>
		</Stack>
	)
}
