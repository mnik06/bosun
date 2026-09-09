import { Alert, Card, Stack, Text } from '@mantine/core'

import { AppModal, CopyableCommand } from '~/shared/ui'

function Step ({
	title,
	detail,
	command
}: {
	title: string,
	detail: string,
	command: string
}) {
	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Stack gap={4}>
					<Text fw={600}>{title}</Text>
					<Text size="sm" c="dimmed">
						{detail}
					</Text>
				</Stack>

				<CopyableCommand label="Run on the machine" command={command} />
			</Stack>
		</Card>
	)
}

export function SetupGithubModal ({
	machineName,
	opened,
	onClose
}: {
	machineName: string,
	opened: boolean,
	onClose: () => void
}) {
	return (
		<AppModal opened={opened} onClose={onClose} title="Set up GitHub" centered size="lg">
			<Stack gap="md">
				<Text size="sm">
					A queue commits every bullet on a branch of its own. With <strong>gh</strong> signed in on{' '}
					{machineName} it also pushes that branch and opens a pull request when a plan finishes.
					Without it, queues still run — the commits simply stay local.
				</Text>

				<Step
					title="1. Install gh"
					detail="Debian and Ubuntu. On another distribution use its package manager, or the tarball from cli.github.com."
					command="sudo apt update && sudo apt install -y gh"
				/>

				<Step
					title="2. Sign in"
					detail="Prints a one-time code and a URL. Open the URL on the machine you are sitting at, paste the code — no browser is needed on the VPS."
					command="gh auth login"
				/>

				<Step
					title="3. Let git use that login"
					detail="Installs gh as git's credential helper, which is what makes the push work rather than prompting for a password nobody is there to type."
					command="gh auth setup-git"
				/>

				<Text size="xs" c="dimmed">
					Check it with gh auth status, then hit Refresh on this machine.
				</Text>

				<Alert color="blue" variant="light" title="The credential stays on the machine">
					<Text size="sm">
						gh keeps its own token in its own store. Bosun never sees it, never asks for it, and
						holds no GitHub credential of its own — preflight only reports whether that box is
						signed in.
					</Text>
				</Alert>
			</Stack>
		</AppModal>
	)
}
