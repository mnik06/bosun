import { Alert, type AlertVariant } from '@mantine/core'

import { toErrorMessage } from '~/shared/lib'

export function QueryErrorAlert ({ title, error, variant }: { title: string, error: unknown, variant?: AlertVariant }) {
	return (
		<Alert color="red" title={title} {...(variant === undefined ? {} : { variant })}>
			{toErrorMessage(error, 'Unknown error')}
		</Alert>
	)
}
