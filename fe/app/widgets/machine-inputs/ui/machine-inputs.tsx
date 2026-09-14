import { Alert, Badge, Card, Center, Divider, Loader, Stack, Tabs, Text } from '@mantine/core'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { AGENT_TOO_OLD_FOR_INPUTS, type Machine } from '~/entities/machine'
import { useMachineOnboardingQuery } from '~/entities/repository'
import { envFilePath, VarsEditor } from '~/features/edit-env-sets'
import { MachinePolicySwitch } from '~/features/set-machine-policy'
import { inputGroups, type VarsGroup } from '~/widgets/machine-inputs/lib/input-groups'
import { AddPathForm } from '~/widgets/machine-inputs/ui/add-path-form'

const SECRETS_TAB = 'secrets'
const ADD_TAB = 'add'

function envTab (path: string): string {
	return `env:${path}`
}

// Remounts the editor when what the machine holds changes, so a save clears the
// typed values and the pairs pick up the keys that are stored now.
function editorKey (group: VarsGroup & { updatedAt?: string | null }): string {
	const required = group.required.map((requirement) => `${requirement.key}:${String(requirement.missing)}`)

	return [group.updatedAt ?? '', ...group.storedKeys, ...required].join(',')
}

function MissingBadge ({ count }: { count: number }) {
	return count === 0 ? null : (
		<Badge size="xs" color="red" circle>
			{count}
		</Badge>
	)
}

export function MachineInputs ({ machine }: { machine: Machine }) {
	const onboarding = useMachineOnboardingQuery({ machineId: machine.id, enabled: machine.repositoryId != null })
	const [addedPaths, setAddedPaths] = useState<string[]>([])
	const [tab, setTab] = useState<string | null>(null)

	if (onboarding.isLoading) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	const groups = inputGroups({
		requirements: onboarding.data?.run.requirements ?? [],
		missing: onboarding.data?.missing ?? [],
		envSets: machine.envSets ?? [],
		sessionSecrets: machine.sessionSecrets ?? [],
		addedPaths
	})
	const tabs = [...groups.envs.map((group) => envTab(group.path)), SECRETS_TAB, ADD_TAB]
	const active = tab !== null && tabs.includes(tab) ? tab : (tabs[0] ?? SECRETS_TAB)

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				{machine.publicKey == null ? (
					<Alert color="yellow" variant="light" title="Values cannot be sent to this machine">
						{AGENT_TOO_OLD_FOR_INPUTS}
					</Alert>
				) : null}

				<MachinePolicySwitch machine={machine} why={groups.policy?.why ?? null} />

				<Divider />

				<Tabs value={active} onChange={setTab} keepMounted={false}>
					<Tabs.List>
						{groups.envs.map((group) => (
							<Tabs.Tab
								key={group.path}
								value={envTab(group.path)}
								rightSection={<MissingBadge count={group.missing} />}
							>
								<span className="font-mono">{envFilePath(group.path)}</span>
							</Tabs.Tab>
						))}
						<Tabs.Tab value={SECRETS_TAB} rightSection={<MissingBadge count={groups.secrets.missing} />}>
							Test accounts
						</Tabs.Tab>
						<Tabs.Tab value={ADD_TAB} leftSection={<Plus size={14} />}>
							Add
						</Tabs.Tab>
					</Tabs.List>

					{groups.envs.map((group) => (
						<Tabs.Panel key={group.path} value={envTab(group.path)} pt="md">
							<VarsEditor
								key={editorKey(group)}
								machine={machine}
								target={{ kind: 'env', path: group.path }}
								required={group.required}
								storedKeys={group.storedKeys}
							/>
						</Tabs.Panel>
					))}

					<Tabs.Panel value={SECRETS_TAB} pt="md">
						<Stack gap="sm">
							<Text size="xs" c="dimmed">
								Credentials a session signs in with — put into its environment, never written to a file.
							</Text>
							<VarsEditor
								key={editorKey(groups.secrets)}
								machine={machine}
								target={{ kind: 'secrets' }}
								required={groups.secrets.required}
								storedKeys={groups.secrets.storedKeys}
							/>
						</Stack>
					</Tabs.Panel>

					<Tabs.Panel value={ADD_TAB} pt="md">
						<AddPathForm
							existing={groups.envs.map((group) => group.path)}
							onAdd={(path) => {
								setAddedPaths((previous) => [...previous, path])
								setTab(envTab(path))
							}}
						/>
					</Tabs.Panel>
				</Tabs>
			</Stack>
		</Card>
	)
}
