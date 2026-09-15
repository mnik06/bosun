import { Alert, Stack, Text } from '@mantine/core'

import { AppModal, SetupStepCard } from '~/shared/ui'

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
					With <strong>gh</strong> signed in on {machineName}, a session there can read and push to the
					checkout it plans in. Plans are built only on a machine with a repository attached, which
					needs no <strong>gh</strong> at all.
				</Text>

				<SetupStepCard
					title="1. Install gh"
					detail="Debian and Ubuntu. On another distribution use its package manager, or the tarball from cli.github.com."
					command="sudo apt update && sudo apt install -y gh"
				/>

				<SetupStepCard
					title="2. Sign in"
					detail="Prints a one-time code and a URL. Open the URL on the machine you are sitting at, paste the code — no browser is needed on the VPS."
					command="gh auth login"
				/>

				<SetupStepCard
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
