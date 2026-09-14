import { ActionIcon, Code, CopyButton, Group, Tooltip } from '@mantine/core'
import { Check, Copy } from 'lucide-react'

export function InlineCommand ({ command }: { command: string }) {
	return (
		<Group gap={4} wrap="nowrap">
			<Code className="font-mono text-xs break-all">{command}</Code>
			<CopyButton value={command}>
				{({ copied, copy }) => (
					<Tooltip label={copied ? 'Copied' : 'Copy'}>
						<ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Copy ${command}`} onClick={copy}>
							{copied ? <Check size={14} /> : <Copy size={14} />}
						</ActionIcon>
					</Tooltip>
				)}
			</CopyButton>
		</Group>
	)
}
