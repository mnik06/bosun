import { Badge, Button, Group, Stack, Text } from '@mantine/core'
import { useState } from 'react'

import { useMachineQuery } from '~/entities/machine'
import type { MissingEnv } from '~/entities/plan'
import { envFilePath, EnvSetModal, type EnvPrefill } from '~/features/edit-env-sets'

// The keys a stopped build named, one row per `.env` folder, each opening the env
// set it lives in with those keys pinned on top. Saving them is all it takes: the
// build resumes once the machine reports holding them.
export function MissingEnvPanel ({ machineId, missingEnv }: { machineId: string, missingEnv: MissingEnv[] }) {
	const machine = useMachineQuery(machineId)
	const [prefill, setPrefill] = useState<EnvPrefill | null>(null)
	const envSets = machine.data?.envSets ?? []
	const envSet = prefill === null ? null : envSets.find((set) => set.path === prefill.path) ?? null

	return (
		<Stack gap="xs">
			{missingEnv.map((entry) => (
				<Group key={entry.path} gap="xs" justify="space-between" wrap="wrap">
					<Group gap={4} className="min-w-0">
						<Text size="sm" className="font-mono">
							{envFilePath(entry.path)}
						</Text>
						{entry.keys.map((key) => (
							<Badge key={key} size="sm" variant="light" color="red" radius="sm" tt="none" className="font-mono">
								{key}
							</Badge>
						))}
					</Group>
					<Button
						size="xs"
						variant="light"
						disabled={machine.data === undefined}
						onClick={() => {
							setPrefill({ path: entry.path, keys: entry.keys })
						}}
					>
						Fill values
					</Button>
				</Group>
			))}

			{machine.data === undefined ? null : (
				<EnvSetModal
					machine={machine.data}
					envSet={envSet}
					prefill={prefill}
					opened={prefill !== null}
					onClose={() => {
						setPrefill(null)
					}}
				/>
			)}
		</Stack>
	)
}
