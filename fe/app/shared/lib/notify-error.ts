import { notifications } from '@mantine/notifications'

import { toErrorMessage } from './to-error-message'

export function notifyError (opts: { title: string, error: unknown }): void {
	notifications.show({
		color: 'red',
		title: opts.title,
		message: toErrorMessage(opts.error, 'Unknown error')
	})
}
