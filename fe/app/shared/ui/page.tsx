import { Container, type ContainerProps, Group, Stack, Title } from '@mantine/core'
import type { ReactNode } from 'react'

export function Page ({
	title,
	actions,
	size = 'md',
	children
}: {
	title?: string,
	actions?: ReactNode,
	size?: ContainerProps['size'],
	children: ReactNode
}) {
	return (
		<Container size={size} px={0} py="md">
			<Stack gap="lg">
				{title === undefined ? null : (
					<Group justify="space-between" align="center">
						<Title order={2}>{title}</Title>
						{actions}
					</Group>
				)}

				{children}
			</Stack>
		</Container>
	)
}
