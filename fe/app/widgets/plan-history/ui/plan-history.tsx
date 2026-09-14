import { Alert, Card, Center, Group, Loader, Stack, Text, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import {
	HISTORY_STATES,
	PlanStatusBadge,
	resolvePlanState,
	usePlansQuery,
	type PlanListEntry
} from '~/entities/plan'
import { formatRelativeTime, toErrorMessage } from '~/shared/lib'

function matches (entry: PlanListEntry, search: string): boolean {
	const query = search.trim().toLowerCase().replace(/^#/, '')

	if (query === '') {
		return true
	}

	return String(entry.number).startsWith(query) || (entry.title ?? '').toLowerCase().includes(query)
}

export function PlanHistory () {
	const { data, isPending, error } = usePlansQuery()
	const [search, setSearch] = useState('')

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (error) {
		return (
			<Alert color="red" title="Could not load plans">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	const entries = data
		.filter((entry) => HISTORY_STATES.includes(resolvePlanState(entry)) && matches(entry, search))
		.sort((a, b) => (b.build?.finishedAt ?? b.createdAt).localeCompare(a.build?.finishedAt ?? a.createdAt))

	return (
		<Stack gap="sm">
			<TextInput
				placeholder="Search by number or title"
				leftSection={<Search size={14} />}
				value={search}
				onChange={(event) => {
					setSearch(event.currentTarget.value)
				}}
			/>

			{entries.length === 0 ? (
				<Text size="sm" c="dimmed">
					Nothing merged, failed or cancelled{search.trim() === '' ? ' yet' : ' matches that'}.
				</Text>
			) : null}

			{entries.map((entry) => (
				<Card key={entry.id} withBorder padding="md" radius="md" component={Link} to={`/plans/${entry.id}`}>
					<Group justify="space-between" align="start" gap="sm" wrap="nowrap">
						<Stack gap={2} className="min-w-0">
							<Text fw={600} truncate>
								<Text component="span" c="dimmed" fw={500}>
									#{entry.number}
								</Text>{' '}
								{entry.title ?? 'Untitled'}
							</Text>
							<Text size="xs" c="dimmed">
								{entry.ownerEmail ?? 'unknown'} · {formatRelativeTime(entry.build?.finishedAt ?? entry.createdAt)}
								{entry.build?.prNumber == null ? '' : ` · PR #${String(entry.build.prNumber)}`}
							</Text>
						</Stack>
						<PlanStatusBadge plan={entry} />
					</Group>
				</Card>
			))}
		</Stack>
	)
}
