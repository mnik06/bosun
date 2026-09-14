import { ActionIcon, Button, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { Plus, X } from 'lucide-react'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useState } from 'react'

import type { EnvSetSummary } from '~/entities/machine'
import { useSaveEnvSet } from '~/features/edit-env-sets/api/use-save-env-set'
import { toEnvSetPayload } from '~/features/edit-env-sets/lib/to-env-set-payload'
import {
	EnvSetFormSchema,
	type EnvPair,
	type EnvSetForm
} from '~/features/edit-env-sets/model/env-set-form'
import { AppModal } from '~/shared/ui'

function emptyPair (): EnvPair {
	return { id: randomId(), key: '', value: '', stored: false }
}

function initialValues (envSet: EnvSetSummary | null): EnvSetForm {
	if (envSet === null) {
		return { path: '', pairs: [emptyPair()] }
	}

	return {
		path: envSet.path,
		pairs: envSet.keys.map((key) => ({ id: randomId(), key, value: '', stored: true }))
	}
}

function EnvSetFormBody ({
	machineId,
	envSet,
	onDone
}: {
	machineId: string,
	envSet: EnvSetSummary | null,
	onDone: () => void
}) {
	const save = useSaveEnvSet(machineId)
	const form = useForm<EnvSetForm>({
		mode: 'uncontrolled',
		initialValues: initialValues(envSet),
		validate: zod4Resolver(EnvSetFormSchema)
	})
	const pairs = form.getValues().pairs

	const submit = (values: EnvSetForm) => {
		save.mutate(toEnvSetPayload(values), { onSuccess: onDone })
	}

	return (
		<form onSubmit={form.onSubmit(submit)}>
			<Stack gap="md">
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
						<Group key={pair.id} gap="xs" align="flex-start" wrap="nowrap">
							<TextInput
								className="min-w-0 flex-1"
								aria-label="Key"
								placeholder="DATABASE_URL"
								readOnly={pair.stored}
								autoComplete="off"
								classNames={{ input: 'font-mono' }}
								key={form.key(`pairs.${index}.key`)}
								{...form.getInputProps(`pairs.${index}.key`)}
							/>
							<PasswordInput
								className="min-w-0 flex-1"
								aria-label="Value"
								placeholder={pair.stored ? 'Unchanged — type to replace' : 'Value'}
								autoComplete="new-password"
								key={form.key(`pairs.${index}.value`)}
								{...form.getInputProps(`pairs.${index}.value`)}
							/>
							<ActionIcon
								variant="subtle"
								color="gray"
								size="input-sm"
								aria-label="Remove pair"
								disabled={pairs.length === 1}
								onClick={() => {
									form.removeListItem('pairs', index)
								}}
							>
								<X size={16} />
							</ActionIcon>
						</Group>
					))}

					<Button
						variant="subtle"
						size="xs"
						className="self-start"
						leftSection={<Plus size={14} />}
						onClick={() => {
							form.insertListItem('pairs', emptyPair())
						}}
					>
						Add pair
					</Button>
				</Stack>

				<Text size="xs" c="dimmed">
					Values are write-only. They go to the machine once and bosun keeps only the key names, so
					a value is never shown again.
					{envSet === null
						? ''
						: ' Leave a stored value empty to keep it; remove its pair to delete the key.'}
				</Text>

				<Group justify="flex-end" gap="sm">
					<Button variant="default" onClick={onDone}>
						Cancel
					</Button>
					<Button type="submit" loading={save.isPending}>
						Save
					</Button>
				</Group>
			</Stack>
		</form>
	)
}

export function EnvSetModal ({
	machineId,
	envSet,
	opened,
	onClose
}: {
	machineId: string,
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
				machineId={machineId}
				envSet={envSet}
				onDone={close}
			/>
		</AppModal>
	)
}
