import { Anchor, AppShell, Avatar, Group, Menu, Text, UnstyledButton } from '@mantine/core'
import { LogOut } from 'lucide-react'
import { Link } from 'react-router'

import { useSignOut } from '~/features/auth'

export function AppHeader ({ email }: { email: string }) {
	const signOut = useSignOut()

	return (
		<AppShell.Header>
			<Group h="100%" px="md" justify="space-between" wrap="nowrap">
				<Anchor component={Link} to="/" fw={700} size="lg" underline="never" c="bright">
					bosun
				</Anchor>

				<Menu position="bottom-end" width={240} withArrow>
					<Menu.Target>
						<UnstyledButton aria-label="Account">
							<Avatar radius="xl" size={32} color="blue">
								{email.slice(0, 1).toUpperCase()}
							</Avatar>
						</UnstyledButton>
					</Menu.Target>

					<Menu.Dropdown>
						<Menu.Label>
							<Text size="xs" truncate>
								{email}
							</Text>
						</Menu.Label>
						<Menu.Divider />
						<Menu.Item
							leftSection={<LogOut size={14} />}
							disabled={signOut.isPending}
							onClick={() => {
								signOut.mutate()
							}}
						>
							Log out
						</Menu.Item>
					</Menu.Dropdown>
				</Menu>
			</Group>
		</AppShell.Header>
	)
}
