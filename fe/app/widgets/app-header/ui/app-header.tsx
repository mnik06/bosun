import { Anchor, Button, Container, Group, Text } from '@mantine/core'
import { Link } from 'react-router'

import { useSignOut } from '~/features/auth'

export function AppHeader ({ email }: { email: string }) {
	const signOut = useSignOut()

	return (
		<Container size="md" pt="lg">
			<Group justify="space-between">
				<Group gap="lg">
					<Anchor component={Link} to="/" fw={600} underline="never">
						bosun
					</Anchor>
					<Anchor component={Link} to="/" size="sm" c="dimmed">
						Machines
					</Anchor>
					<Anchor component={Link} to="/plans" size="sm" c="dimmed">
						Plans
					</Anchor>
				</Group>

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
