import { Alert, Card, Center, Loader, Stack, Text } from '@mantine/core'

import { McpPresetSummary, useMcpPresetsQuery } from '~/entities/mcp-preset'
import { toErrorMessage } from '~/shared/lib'
import { AppModal, CopyableCommand } from '~/shared/ui'

function PresetList ({ machineName }: { machineName: string }) {
	const { data, isPending, error } = useMcpPresetsQuery({ enabled: true })

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (error) {
		return (
			<Alert color="red" title="Could not load the catalogue">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	if (data.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				No presets are published yet. You can still add a server by editing
				<Text component="span" className="font-mono">
					{' ~/.bosun/mcp.json '}
				</Text>
				on the machine.
			</Text>
		)
	}

	return (
		<Stack gap="md">
			<Text size="sm">
				SSH into <strong>{machineName}</strong> and run one of these. The agent prompts for any
				credential, shows you what it will write, and asks before writing it.
			</Text>

			{data.map((preset) => (
				<Card key={preset.id} withBorder padding="md" radius="md">
					<Stack gap="sm">
						<McpPresetSummary preset={preset} />
						<CopyableCommand label="Run on the machine" command={`bosun-agent mcp add ${preset.id}`} />
					</Stack>
				</Card>
			))}

			<Text size="xs" c="dimmed">
				Not on your PATH? Use ~/.local/bin/bosun-agent instead. Once it is added, hit Refresh on
				this machine to pick it up.
			</Text>
		</Stack>
	)
}

export function AddMcpServerModal ({
	machineName,
	opened,
	onClose
}: {
	machineName: string,
	opened: boolean,
	onClose: () => void
}) {
	return (
		<AppModal opened={opened} onClose={onClose} title="Add an MCP server" centered size="lg">
			<Stack gap="md">
				<PresetList machineName={machineName} />

				<Alert color="blue" variant="light" title="Credentials stay on the machine">
					<Text size="sm">
						Tokens are typed at the prompt on the VPS, never here. Bosun never receives one, and
						nothing lands in your shell history.
					</Text>
				</Alert>
			</Stack>
		</AppModal>
	)
}
