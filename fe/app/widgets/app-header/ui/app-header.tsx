import { Anchor, Button, Container, Group, Text } from '@mantine/core'
import { Link } from 'react-router'

import { useSignOut } from '~/features/auth'

export function AppHeader ({ email }: { email: string }) {
	const signOut = useSignOut()

	return (
		<Container size="md" pt="lg">
			<Group justify="space-between">
				<Anchor component={Link} to="/" fw={600} underline="never">
					bosun
				</Anchor>

				<Group gap="sm">
					<Text size="sm" c="dimmed">
						{email}
					</Text>
					<Button
						variant="subtle"
						size="compact-sm"
						loading={signOut.isPending}
						onClick={() => {
							signOut.mutate()
						}}
					>
						Log out
					</Button>
				</Group>
			</Group>
		</Container>
	)
}
