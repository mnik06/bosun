import { Alert, Stack, Text, type AlertVariant } from '@mantine/core'
import type { ReactNode } from 'react'

import { toErrorMessage } from '~/shared/lib'

export function QueryErrorAlert ({ title, error, variant, children }: { title: string, error: unknown, variant?: AlertVariant, children?: ReactNode }) {
	const message = toErrorMessage(error, 'Unknown error')

	return (
		<Alert color="red" title={title} {...(variant === undefined ? {} : { variant })}>
			{children === undefined ? message : (
				<Stack gap={4}>
					<Text size="sm">{message}</Text>
					{children}
				</Stack>
			)}
		</Alert>
	)
}
