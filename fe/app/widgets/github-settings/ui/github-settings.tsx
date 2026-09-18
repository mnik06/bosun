import { Badge, Group, Text } from '@mantine/core'

import { useGithubInstallationsQuery } from '~/entities/repository'
import { ConnectGithubButton } from '~/features/connect-github'
import { SettingsCard } from '~/shared/ui'

export function GithubSettings () {
	const installations = useGithubInstallationsQuery()
	const connected = installations.data ?? []

	return (
		<SettingsCard
			title="GitHub"
			description={
				<>
					Every machine picks its repository, on its own Setup tab, from the accounts connected here.
					Machines clone and push with an hour-long token for one repository, and pull requests are
					opened through the App. No GitHub credential is kept on a machine.
				</>
			}
			actions={
				<Group gap="xs">
					<ConnectGithubButton mode="import" label="Already installed on GitHub?" />
					<ConnectGithubButton label={connected.length === 0 ? 'Connect GitHub' : 'Connect another account'} />
				</Group>
			}
			note={
				<Text size="xs" c="dimmed">
					To add an organization, install the App on it with Connect — GitHub lists the accounts it can go
					on. If the App is already installed there, GitHub shows its settings instead of sending you back:
					use Already installed on GitHub? to connect every installation your account can reach.
				</Text>
			}
			error={installations.error}
			loading={installations.isPending}
			isEmpty={connected.length === 0}
		>
			<Group gap="xs">
				{connected.map((installation) => (
					<Badge key={installation.id} variant="default" tt="none">
						{installation.accountLogin}
					</Badge>
				))}
			</Group>
		</SettingsCard>
	)
}
