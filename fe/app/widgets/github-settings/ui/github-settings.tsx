import { Badge, Group, Text } from '@mantine/core'

import { useGithubInstallationsQuery, useGithubPatConnectionsQuery, useRepositoriesQuery } from '~/entities/repository'
import { ConnectGithubButton } from '~/features/connect-github'
import { ConnectGithubPatButton, GithubPatConnectionBadge } from '~/features/connect-github-pat'
import { QueryErrorAlert, SettingsCard } from '~/shared/ui'

export function GithubSettings () {
	const installations = useGithubInstallationsQuery()
	const patConnections = useGithubPatConnectionsQuery()
	const repositories = useRepositoriesQuery()
	const connected = installations.data ?? []
	const patConnected = patConnections.data ?? []
	// AC-53: "no credential on a machine" stops being true the moment any
	// repository is attached through a token, so the copy below names the
	// exception instead of a blanket claim it can no longer make.
	const hasPatConnectedRepository = (repositories.data ?? []).some((repository) => repository.provider === 'github' && repository.githubPatConnectionId !== null)

	return (
		<SettingsCard
			title="GitHub"
			description={
				<>
					Every machine picks its repository, on its own Setup tab, from the accounts connected here.
					Machines clone and push with an hour-long token for one repository, and pull requests are
					opened through the App.{' '}
					{hasPatConnectedRepository
						? 'A repository connected with a personal access token instead hands that token to its machine directly.'
						: 'No GitHub credential is kept on a machine.'}
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
			// The token fallback is for exactly the case with no installation, so the
			// card's body is never empty.
			isEmpty={false}
		>
			{connected.length === 0 ? null : (
				<Group gap="xs">
					{connected.map((installation) => (
						<Badge key={installation.id} variant="default" tt="none">
							{installation.accountLogin}
						</Badge>
					))}
				</Group>
			)}

			<Group justify="space-between" align="center" gap="sm">
				<Text size="xs" c="dimmed">
					Can&apos;t get the App installed? Connect a repository you can push to with a personal access
					token instead.
				</Text>
				<ConnectGithubPatButton />
			</Group>

			{patConnections.error === null ? null : (
				<QueryErrorAlert title="Could not load token connections" error={patConnections.error} variant="light" />
			)}

			{patConnected.length === 0 ? null : (
				<Group gap="xs">
					{patConnected.map((connection) => (
						<GithubPatConnectionBadge key={connection.id} connection={connection} />
					))}
				</Group>
			)}
		</SettingsCard>
	)
}
