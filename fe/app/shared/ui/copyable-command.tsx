import { Button, Code, CopyButton, Stack, Text } from '@mantine/core'

export function CopyableCommand ({ label, command }: { label: string, command: string }) {
	return (
		<Stack gap="xs">
			<Text size="sm" fw={500}>
				{label}
			</Text>

			<Code block className="font-mono text-xs break-all whitespace-pre-wrap">
				{command}
			</Code>

			<CopyButton value={command}>
				{({ copied, copy }) => (
					<Button variant="light" size="xs" onClick={copy}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
				)}
			</CopyButton>
		</Stack>
	)
}
