import { Alert, Center, Loader, Stack, Text, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { useState } from 'react'

import { matchesPlanSearch, PlanRowCard, sortPlansByRecency, usePlansQuery } from '~/entities/plan'
import { toErrorMessage } from '~/shared/lib'

export function PlanList () {
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

	const entries = sortPlansByRecency(data.filter((entry) => matchesPlanSearch(entry, search)))

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
					{data.length === 0 ? 'No plans yet.' : 'No plans match that search.'}
				</Text>
			) : null}

			{entries.map((entry) => (
				<PlanRowCard key={entry.id} entry={entry} />
			))}
		</Stack>
	)
}
