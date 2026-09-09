import { Anchor, AppShell, Avatar, Group, Menu, Text, UnstyledButton } from '@mantine/core'
import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useSignOut } from '~/features/auth'

export function AppHeader ({ email, projectSwitcher }: { email: string, projectSwitcher?: ReactNode }) {
	const signOut = useSignOut()

	return (
		<AppShell.Header>
			<Group h="100%" px="md" justify="space-between" wrap="nowrap">
				<Group gap="sm" wrap="nowrap">
					<Anchor component={Link} to="/" fw={700} size="lg" underline="never" c="bright">
						bosun
					</Anchor>

					{projectSwitcher}
				</Group>

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
