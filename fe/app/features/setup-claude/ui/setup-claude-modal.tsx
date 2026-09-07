import { Alert, Card, Modal, Stack, Text } from '@mantine/core'

import { CopyableCommand } from '~/shared/ui'

const TOKEN_DOCS = 'Mints a one-year token against a Pro, Max, Team or Enterprise plan. It can only make model requests, which is all a planning session needs.'

function Step ({
	title,
	detail,
	label,
	command
}: {
	title: string,
	detail: string,
	label: string,
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

				<CopyableCommand label={label} command={command} />
			</Stack>
		</Card>
	)
}

export function SetupClaudeModal ({
	machineName,
	opened,
	onClose
}: {
	machineName: string,
	opened: boolean,
	onClose: () => void
}) {
	const onMachine = `On ${machineName}`

	return (
		<Modal opened={opened} onClose={onClose} title="Set up Claude" centered size="lg">
			<Stack gap="md">
				<Text size="sm">
					Planning sessions run the <Text component="span" className="font-mono">claude</Text> CLI
					on the machine itself, so it needs the binary and a credential. Skip step 1 if preflight
					already shows <Text component="span" className="font-mono">claude</Text> green.
				</Text>

				<Step
					title="1. Install Claude Code"
					detail="Needs node 24.15 or newer, which preflight also checks."
					label={onMachine}
					command="curl -fsSL https://claude.ai/install.sh | bash"
				/>

				<Step
					title="2. Mint a token"
					detail={`This one needs a browser, so run it where you are — not on ${machineName}. ${TOKEN_DOCS}`}
					label="On your own machine"
					command="claude setup-token"
				/>

				<Step
					title="3. Paste it in"
					detail="Prompts with echo off, makes one real API call to check the token, and only then writes it to ~/.bosun/env."
					label={onMachine}
					command="bosun-agent auth set"
				/>

				<Text size="xs" c="dimmed">
					Not on your PATH? Use ~/.local/bin/bosun-agent instead. Check it any time with
					bosun-agent auth status, then hit Refresh on this machine to pick it up.
				</Text>

				<Alert color="blue" variant="light" title="The token stays on the machine">
					<Text size="sm">
						It is typed at the prompt on the VPS, never here. Bosun never receives it, and passing
						it at a prompt rather than as an argument keeps it out of your shell history and out of
						/proc.
					</Text>
				</Alert>
			</Stack>
		</Modal>
	)
}
