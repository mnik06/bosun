import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { ClipboardPaste, Plus } from 'lucide-react'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useState } from 'react'

import type { EnvSetSummary } from '~/entities/machine'
import { useSaveEnvSet } from '~/features/edit-env-sets/api/use-save-env-set'
import { mergePastedPairs } from '~/features/edit-env-sets/lib/merge-pasted-pairs'
import { parseEnvText } from '~/features/edit-env-sets/lib/parse-env-text'
import { toEnvSetPayload } from '~/features/edit-env-sets/lib/to-env-set-payload'
import {
	EnvSetFormSchema,
	type EnvPair,
	type EnvSetForm
} from '~/features/edit-env-sets/model/env-set-form'
import { EnvPairRow } from '~/features/edit-env-sets/ui/env-pair-row'
import { PasteEnvPanel } from '~/features/edit-env-sets/ui/paste-env-panel'
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

// Line numbers only: the notification is on screen for anyone nearby, and a
// skipped line is as likely as any other to hold a secret.
function skippedMessage (skippedLines: number[]): string | null {
	return skippedLines.length === 0
		? null
		: `Skipped line ${skippedLines.join(', ')} — not a single-line KEY=value.`
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
	const [pasting, setPasting] = useState(false)
	const form = useForm<EnvSetForm>({
		mode: 'uncontrolled',
		initialValues: initialValues(envSet),
		validate: zod4Resolver(EnvSetFormSchema)
	})
	const pairs = form.getValues().pairs

	const addPasted = (text: string): boolean => {
		const { vars, skippedLines } = parseEnvText(text)
		const skipped = skippedMessage(skippedLines)

		if (vars.length === 0) {
			notifications.show({
				color: 'yellow',
				title: 'No variables found',
				message: skipped ?? 'Paste lines in KEY=value form.'
			})

			return false
		}

		form.setFieldValue(
			'pairs',
			mergePastedPairs({ pairs: form.getValues().pairs, vars, newId: randomId })
		)
		notifications.show({
			color: skipped === null ? 'green' : 'yellow',
			title: `Filled in ${vars.length} ${vars.length === 1 ? 'variable' : 'variables'}`,
			message: skipped ?? 'Check the keys, then save.'
		})
		setPasting(false)

		return true
	}

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
						<EnvPairRow
							key={pair.id}
							form={form}
							pair={pair}
							index={index}
							removable={pairs.length > 1}
							onPasteEnv={addPasted}
						/>
					))}

					{pasting ? (
						<PasteEnvPanel
							onAdd={addPasted}
							onCancel={() => {
								setPasting(false)
							}}
						/>
					) : (
						<Group gap="xs">
							<Button
								variant="subtle"
								size="xs"
								leftSection={<Plus size={14} />}
								onClick={() => {
									form.insertListItem('pairs', emptyPair())
								}}
							>
								Add pair
							</Button>
							<Button
								variant="subtle"
								size="xs"
								leftSection={<ClipboardPaste size={14} />}
								onClick={() => {
									setPasting(true)
								}}
							>
								Paste .env
							</Button>
						</Group>
					)}
				</Stack>

				<Text size="xs" c="dimmed">
					Paste a whole .env file with Paste .env, or straight into any Key field — every KEY=value
					line becomes a pair. Values are write-only: they go to the machine once and bosun keeps only
					the key names, so a value is never shown again.
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
