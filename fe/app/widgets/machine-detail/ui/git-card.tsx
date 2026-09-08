import { Card, Divider, Group, Stack, Text } from '@mantine/core'

import { SetupGithubButton } from '~/features/setup-github'

// One provider today. The card is a list because the second one — GitLab,
// Bitbucket — is a row here and nothing else, rather than a rewrite of the card.
const PROVIDERS = [
	{
		id: 'github',
		name: 'GitHub',
		description: 'gh holds the credential on the machine and opens the pull request.',
		Action: SetupGithubButton
	}
]

export function GitCard ({ machineName }: { machineName: string }) {
	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Stack gap={2}>
					<Text fw={600}>Git</Text>
					<Text size="sm" c="dimmed">
						Where a queue pushes its branches and opens pull requests. Without one, queues still
						run and the commits stay on the machine.
					</Text>
				</Stack>

				<Divider />

				{PROVIDERS.map((provider) => (
					<Group key={provider.id} justify="space-between" align="center" wrap="nowrap">
						<Stack gap={2}>
							<Text size="sm" fw={500}>
								{provider.name}
							</Text>
							<Text size="xs" c="dimmed">
								{provider.description}
							</Text>
						</Stack>

						<provider.Action machineName={machineName} />
					</Group>
				))}
			</Stack>
		</Card>
	)
}
