import { Card, Group, Loader, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

import { QueryErrorAlert } from '~/shared/ui/query-error-alert'

export function SettingsCard ({
	title,
	description,
	actions,
	note,
	error,
	loading,
	isEmpty,
	children
}: {
	title: string,
	description: ReactNode,
	actions: ReactNode,
	note?: ReactNode,
	error: unknown,
	loading: boolean,
	isEmpty: boolean,
	children: ReactNode
}) {
	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" align="center" gap="sm">
					<Stack gap={2} className="min-w-0">
						<Text fw={600}>{title}</Text>
						<Text size="sm" c="dimmed">{description}</Text>
					</Stack>
					{actions}
				</Group>

				{note ?? null}

				{error === null ? null : <QueryErrorAlert title={`Could not load ${title.toLowerCase()}`} error={error} variant="light" />}

				{loading ? <Loader size="sm" /> : null}

				{isEmpty ? null : children}
			</Stack>
		</Card>
	)
}
