import { ActionIcon, Group, PasswordInput, TextInput } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import { X } from 'lucide-react'

import type { EnvPair, EnvSetForm } from '~/features/edit-env-sets/model/env-set-form'

export function EnvPairRow ({
	form,
	pair,
	index,
	removable,
	onPasteEnv
}: {
	form: UseFormReturnType<EnvSetForm>,
	pair: EnvPair,
	index: number,
	removable: boolean,
	onPasteEnv: (text: string) => void
}) {
	return (
		<Group gap="xs" align="flex-start" wrap="nowrap">
			<TextInput
				className="min-w-0 flex-1"
				aria-label="Key"
				placeholder="DATABASE_URL"
				readOnly={pair.stored || pair.required}
				autoComplete="off"
				classNames={{ input: 'font-mono' }}
				key={form.key(`pairs.${index}.key`)}
				{...form.getInputProps(`pairs.${index}.key`)}
				onPaste={(event) => {
					const text = event.clipboardData.getData('text')

					// A key never contains `=`, so a paste that does is a line of a .env
					// file, or the whole file, and belongs spread across the pairs.
					if (text.includes('=')) {
						event.preventDefault()
						onPasteEnv(text)
					}
				}}
			/>
			<PasswordInput
				className="min-w-0 flex-1"
				aria-label="Value"
				placeholder={pair.stored ? 'Held by the machine — type to replace' : 'Value'}
				autoComplete="new-password"
				key={form.key(`pairs.${index}.value`)}
				{...form.getInputProps(`pairs.${index}.value`)}
			/>
			<ActionIcon
				variant="subtle"
				color="gray"
				size="input-sm"
				aria-label="Remove pair"
				disabled={!removable}
				onClick={() => {
					form.removeListItem('pairs', index)
				}}
			>
				<X size={16} />
			</ActionIcon>
		</Group>
	)
}
