import { Button, Group } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { ClipboardPaste, Plus } from 'lucide-react'
import { useState } from 'react'

import { blankPair } from '~/features/edit-env-sets/lib/editor-pairs'
import type { EnvSetForm } from '~/features/edit-env-sets/model/env-set-form'
import { pasteEnv } from '~/features/edit-env-sets/model/paste-env'
import { PasteEnvPanel } from '~/features/edit-env-sets/ui/paste-env-panel'

export function PairsActions ({ form }: { form: UseFormReturnType<EnvSetForm> }) {
	const [pasting, setPasting] = useState(false)

	if (pasting) {
		return (
			<PasteEnvPanel
				onAdd={(text) => {
					const added = pasteEnv({ form, text })

					if (added) {
						setPasting(false)
					}

					return added
				}}
				onCancel={() => {
					setPasting(false)
				}}
			/>
		)
	}

	return (
		<Group gap="xs">
			<Button
				variant="subtle"
				size="xs"
				leftSection={<Plus size={14} />}
				onClick={() => {
					form.insertListItem('pairs', blankPair(randomId()))
				}}
			>
				Add variable
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
	)
}
