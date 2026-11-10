import { ActionIcon, Badge, Group, PasswordInput, TextInput, Tooltip } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import { X } from 'lucide-react'

import type { EnvPair, EnvSetForm } from '~/features/edit-env-sets/model/env-set-form'

function valuePlaceholder (pair: EnvPair): string {
	if (pair.auto === true) {
		return 'Filled by bosun — type to use your own'
	}

	return pair.stored ? 'Held by the machine — type to replace' : 'Value'
}

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
				{...(pair.auto === true
					? {
						rightSectionWidth: 52,
						rightSection: (
							<Tooltip label="Filled by bosun from the example, a running service or a generated secret">
								<Badge size="xs" variant="light" color="teal">
									auto
								</Badge>
							</Tooltip>
						)
					}
					: {})}
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
				placeholder={valuePlaceholder(pair)}
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
