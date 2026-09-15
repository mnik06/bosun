import { ActionIcon, Indicator, Menu, Text } from '@mantine/core'
import { BellRing } from 'lucide-react'
import { Link } from 'react-router'

import { planLabel, useNeedsYouQuery, type NeedsYouItem } from '~/entities/plan'

const KIND_LABEL: Record<NeedsYouItem['kind'], string> = {
	question: 'Question',
	overlap: 'Overlap decision',
	integration: 'Sync failed',
	checks: 'Checks still red',
	provider_failed: 'The plan it needs failed',
	recheck_failed: 'Failed its re-check',
	worktree: 'Could not start'
}

// Every decision lives on a plan page, so this is what brings a person to the one
// that is waiting — from whichever page they happen to be on.
export function NeedsYouMenu () {
	const { data } = useNeedsYouQuery()
	const items = data ?? []

	return (
		<Menu position="bottom-end" width={320} withArrow>
			<Menu.Target>
				<Indicator label={items.length} size={16} color="orange" disabled={items.length === 0}>
					<ActionIcon variant="subtle" size="lg" aria-label={`Needs you: ${String(items.length)}`}>
						<BellRing size={18} />
					</ActionIcon>
				</Indicator>
			</Menu.Target>

			<Menu.Dropdown>
				<Menu.Label>Needs you</Menu.Label>
				{items.length === 0 ? (
					<Text size="sm" c="dimmed" px="sm" py="xs">
						Nothing is waiting on anybody.
					</Text>
				) : (
					items.map((item) => (
						<Menu.Item
							key={`${item.planId}-${item.kind}`}
							component={Link}
							to={`/plans/${item.planId}`}
						>
							<Text size="sm" fw={600} truncate>
								{planLabel({ number: item.planNumber, title: item.planTitle })}
							</Text>
							<Text size="xs" c="dimmed" lineClamp={2}>
								{KIND_LABEL[item.kind]} — {item.detail}
							</Text>
						</Menu.Item>
					))
				)}
			</Menu.Dropdown>
		</Menu>
	)
}
