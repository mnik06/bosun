import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useState } from 'react'

import { AGENT_TOO_OLD_FOR_INPUTS, type EnvSetSummary, type Machine } from '~/entities/machine'
import { useSaveVars } from '~/features/edit-env-sets/api/use-save-vars'
import { blankPair, editorPairs } from '~/features/edit-env-sets/lib/editor-pairs'
import { toEnvSetPayload } from '~/features/edit-env-sets/lib/to-env-set-payload'
import { EnvSetFormSchema, type EnvSetForm } from '~/features/edit-env-sets/model/env-set-form'
import { pasteEnv } from '~/features/edit-env-sets/model/paste-env'
import { EnvPairRow } from '~/features/edit-env-sets/ui/env-pair-row'
import { PairsActions } from '~/features/edit-env-sets/ui/pairs-actions'
import { AppModal } from '~/shared/ui'

type MachineKey = Pick<Machine, 'id' | 'publicKey'>

function initialValues (envSet: EnvSetSummary | null): EnvSetForm {
	if (envSet === null) {
		return { path: '', pairs: [blankPair(randomId())] }
	}

	return { path: envSet.path, pairs: editorPairs({ required: [], storedKeys: envSet.keys, newId: randomId }) }
}

function EnvSetFormBody ({
	machine,
	envSet,
	onDone
}: {
	machine: MachineKey,
	envSet: EnvSetSummary | null,
	onDone: () => void
}) {
	const save = useSaveVars(machine)
	const form = useForm<EnvSetForm>({
		mode: 'uncontrolled',
		initialValues: initialValues(envSet),
		validate: zod4Resolver(EnvSetFormSchema)
	})
	const pairs = form.getValues().pairs
	const keyless = machine.publicKey == null

	const submit = (values: EnvSetForm) => {
		const payload = toEnvSetPayload(values)

		save.mutate({ target: { kind: 'env', path: payload.path }, vars: payload.vars }, { onSuccess: onDone })
	}

	return (
		<form onSubmit={form.onSubmit(submit)}>
			<Stack gap="md">
				{keyless ? (
					<Alert color="yellow" variant="light" title="Values cannot be sent to this machine">
						{AGENT_TOO_OLD_FOR_INPUTS}
					</Alert>
				) : null}

				<TextInput
					label="Path"
					description="A folder inside the repository. The variables are written into <path>/.env in every queue worktree before each bullet — the machine must be online to receive them."
					placeholder="be"
					readOnly={envSet !== null}
					data-autofocus={envSet === null ? true : undefined}
					autoComplete="off"
					classNames={{ input: 'font-mono' }}
					key={form.key('path')}
					{...form.getInputProps('path')}
				/>

				<Stack gap="xs">
					<Text size="sm" fw={500}>
						Variables
					</Text>

					{pairs.map((pair, index) => (
						<EnvPairRow
							key={pair.id}
							form={form}
							pair={pair}
							index={index}
							removable={pairs.length > 1}
							onPasteEnv={(text) => pasteEnv({ form, text })}
						/>
					))}

					<PairsActions form={form} />
				</Stack>

				<Text size="xs" c="dimmed">
					Paste a whole .env file with Paste .env, or straight into any Key field — every KEY=value
					line becomes a pair. Values are sealed in this browser to the machine&apos;s key before they
					are sent: bosun relays them and keeps only the key names, so a value is never shown again.
					{envSet === null
						? ''
						: ' Leave a stored value empty to keep it; remove its pair to delete the key.'}
				</Text>

				<Group justify="flex-end" gap="sm">
					<Button variant="default" onClick={onDone}>
						Cancel
					</Button>
					<Button type="submit" loading={save.isPending} disabled={keyless}>
						Save
					</Button>
				</Group>
			</Stack>
		</form>
	)
}

export function EnvSetModal ({
	machine,
	envSet,
	opened,
	onClose
}: {
	machine: MachineKey,
	envSet: EnvSetSummary | null,
	opened: boolean,
	onClose: () => void
}) {
	const [closings, setClosings] = useState(0)

	// Remounting the form on close drops the typed secrets at once, rather than
	// whenever the exit transition unmounts it. The set in the key keeps a form
	// from opening with the keys of a set that has changed since.
	const close = () => {
		setClosings((count) => count + 1)
		onClose()
	}

	return (
		<AppModal opened={opened} onClose={close} title="Env variables" size="lg">
			<EnvSetFormBody
				key={`${closings}:${envSet?.path ?? ''}:${envSet?.updatedAt ?? ''}`}
				machine={machine}
				envSet={envSet}
				onDone={close}
			/>
		</AppModal>
	)
}
