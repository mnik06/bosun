import { Alert, Button, Group, PasswordInput, Stack, Switch, Text } from '@mantine/core'
import { useState } from 'react'

import { AGENT_TOO_OLD_FOR_INPUTS, type Machine } from '~/entities/machine'
import type { MachineOnboarding } from '~/entities/repository'
import { useProvideInputs } from '~/features/provide-inputs/api/use-provide-inputs'
import {
	inputWrites,
	requiredInputs,
	type InputsDraft,
	type RequiredKey
} from '~/features/provide-inputs/lib/input-plan'

type InputsMachine = Pick<Machine, 'id' | 'publicKey' | 'envSets' | 'sessionSecrets' | 'policy'>

function KeyInput ({
	requirement,
	value,
	onChange
}: {
	requirement: RequiredKey,
	value: string,
	onChange: (value: string) => void
}) {
	return (
		<PasswordInput
			label={<span className="font-mono">{requirement.key}</span>}
			description={`${requirement.why} — found in ${requirement.evidence}`}
			placeholder={requirement.stored ? 'Held by the machine — type to replace' : 'Value'}
			error={requirement.missing && value === '' ? 'Still missing' : undefined}
			autoComplete="new-password"
			value={value}
			onChange={(event) => {
				onChange(event.currentTarget.value)
			}}
		/>
	)
}

function InputsBody ({ machine, onboarding }: { machine: InputsMachine, onboarding: MachineOnboarding }) {
	const save = useProvideInputs(machine)
	const [draft, setDraft] = useState<InputsDraft>({ env: {}, secrets: {} })
	const [applyMigrations, setApplyMigrations] = useState(machine.policy?.applyMigrations ?? true)
	const keyless = machine.publicKey == null
	const inputs = requiredInputs({
		requirements: onboarding.run.requirements,
		missing: onboarding.missing,
		envSets: machine.envSets ?? [],
		sessionSecrets: machine.sessionSecrets ?? []
	})

	const setEnv = (opts: { path: string, key: string, value: string }) => {
		setDraft((previous) => ({
			...previous,
			env: { ...previous.env, [opts.path]: { ...previous.env[opts.path], [opts.key]: opts.value } }
		}))
	}

	const submit = () => {
		save.mutate(
			{
				writes: inputWrites({ draft, envSets: machine.envSets ?? [], sessionSecrets: machine.sessionSecrets ?? [] }),
				applyMigrations: inputs.policy === null ? null : applyMigrations
			},
			{
				onSuccess: () => {
					setDraft({ env: {}, secrets: {} })
				}
			}
		)
	}

	return (
		<Stack gap="md">
			{keyless ? (
				<Alert color="yellow" variant="light" title="Values cannot be sent to this machine">
					{AGENT_TOO_OLD_FOR_INPUTS}
				</Alert>
			) : null}

			{inputs.envPaths.map((group) => (
				<Stack key={group.path} gap="xs">
					<Text size="sm" fw={600} className="font-mono">
						{group.path === '.' ? '.env' : `${group.path}/.env`}
					</Text>
					{group.keys.map((requirement) => (
						<KeyInput
							key={requirement.key}
							requirement={requirement}
							value={draft.env[group.path]?.[requirement.key] ?? ''}
							onChange={(value) => {
								setEnv({ path: group.path, key: requirement.key, value })
							}}
						/>
					))}
				</Stack>
			))}

			{inputs.secrets.length === 0 ? null : (
				<Stack gap="xs">
					<Text size="sm" fw={600}>
						Test-account secrets
					</Text>
					<Text size="xs" c="dimmed">
						Put into a session&apos;s environment when it signs in, and never written to a file.
					</Text>
					{inputs.secrets.map((requirement) => (
						<KeyInput
							key={requirement.key}
							requirement={requirement}
							value={draft.secrets[requirement.key] ?? ''}
							onChange={(value) => {
								setDraft((previous) => ({ ...previous, secrets: { ...previous.secrets, [requirement.key]: value } }))
							}}
						/>
					))}
				</Stack>
			)}

			{inputs.policy === null ? null : (
				<Switch
					label="Apply migrations on this machine"
					description={`${inputs.policy.why} — found in ${inputs.policy.evidence}. Off when it points at a database bosun must not migrate.`}
					checked={applyMigrations}
					onChange={(event) => {
						setApplyMigrations(event.currentTarget.checked)
					}}
				/>
			)}

			<Text size="xs" c="dimmed">
				Every value is sealed in this browser to the machine&apos;s key, so bosun relays it without
				being able to read it. Verify starts on its own once nothing is missing.
			</Text>

			<Group justify="flex-end">
				<Button size="xs" loading={save.isPending} disabled={keyless} onClick={submit}>
					Save inputs
				</Button>
			</Group>
		</Stack>
	)
}

export function ProvideInputsForm ({ machine, onboarding }: { machine: InputsMachine, onboarding: MachineOnboarding }) {
	if (onboarding.run.requirements.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				Discovery found nothing this machine has to provide.
			</Text>
		)
	}

	return <InputsBody key={onboarding.run.id} machine={machine} onboarding={onboarding} />
}
