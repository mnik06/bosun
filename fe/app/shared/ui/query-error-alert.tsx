import { Alert } from '@mantine/core'

import { toErrorMessage } from '~/shared/lib'

export function QueryErrorAlert ({ title, error }: { title: string, error: unknown }) {
	return (
		<Alert color="red" title={title}>
			{toErrorMessage(error, 'Unknown error')}
		</Alert>
	)
}
