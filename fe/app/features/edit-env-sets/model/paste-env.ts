import type { UseFormReturnType } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'

import { mergePastedPairs } from '~/features/edit-env-sets/lib/merge-pasted-pairs'
import { parseEnvText } from '~/features/edit-env-sets/lib/parse-env-text'
import type { EnvSetForm } from '~/features/edit-env-sets/model/env-set-form'

// Line numbers only: the notification is on screen for anyone nearby, and a
// skipped line is as likely as any other to hold a secret.
function skippedMessage (skippedLines: number[]): string | null {
	return skippedLines.length === 0
		? null
		: `Skipped line ${skippedLines.join(', ')} — not a single-line KEY=value.`
}

export function pasteEnv (opts: { form: UseFormReturnType<EnvSetForm>, text: string }): boolean {
	const { vars, skippedLines } = parseEnvText(opts.text)
	const skipped = skippedMessage(skippedLines)

	if (vars.length === 0) {
		notifications.show({
			color: 'yellow',
			title: 'No variables found',
			message: skipped ?? 'Paste lines in KEY=value form.'
		})

		return false
	}

	opts.form.setFieldValue(
		'pairs',
		mergePastedPairs({ pairs: opts.form.getValues().pairs, vars, newId: randomId })
	)
	notifications.show({
		color: skipped === null ? 'green' : 'yellow',
		title: `Filled in ${vars.length} ${vars.length === 1 ? 'variable' : 'variables'}`,
		message: skipped ?? 'Check the keys, then save.'
	})

	return true
}
