import { Anchor, Badge, Group, Stack, Text } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

import type { McpPreset } from '~/entities/mcp-preset/model/mcp-preset'

export function McpPresetSummary ({ preset }: { preset: McpPreset }) {
	return (
		<Stack gap={4}>
			<Group gap="xs" align="center">
				<Text fw={600}>{preset.name}</Text>

				{preset.requires.map((requirement) => (
					<Badge key={requirement.env} size="xs" variant="light" color="yellow">
						needs {requirement.label}
					</Badge>
				))}
			</Group>

			<Text size="sm" c="dimmed">
				{preset.description}
			</Text>

			{preset.docsUrl === undefined ? null : (
				<Anchor href={preset.docsUrl} target="_blank" rel="noreferrer" size="xs">
					<Group gap={4} align="center">
						Documentation
						<ExternalLink size={12} />
					</Group>
				</Anchor>
			)}
		</Stack>
	)
}
