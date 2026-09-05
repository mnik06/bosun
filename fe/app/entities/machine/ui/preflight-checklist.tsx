import { List, Text, ThemeIcon } from '@mantine/core'
import { CheckIcon, XIcon } from 'lucide-react'

import type { PreflightCheck } from '~/entities/machine/model/machine'

export function PreflightChecklist ({ checks }: { checks: PreflightCheck[] | null }) {
	if (checks === null || checks.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				No preflight reported yet — the agent sends it on connect.
			</Text>
		)
	}

	return (
		<List spacing="xs" size="sm" center>
			{checks.map((check) => (
				<List.Item
					key={check.name}
					icon={
						<ThemeIcon color={check.ok ? 'green' : 'red'} size={20} radius="xl">
							{check.ok ? <CheckIcon size={12} /> : <XIcon size={12} />}
						</ThemeIcon>
					}
				>
					<Text component="span" fw={500} className="font-mono">
						{check.name}
					</Text>
					{check.detail === undefined ? null : (
						<Text component="span" c="dimmed">
							{' '}
							— {check.detail}
						</Text>
					)}
				</List.Item>
			))}
		</List>
	)
}
