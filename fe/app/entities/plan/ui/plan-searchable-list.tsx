import { Stack, Text, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { useState } from 'react'

import { usePlansQuery } from '~/entities/plan/api/plan.queries'
import { matchesPlanSearch, sortPlansByRecency } from '~/entities/plan/lib/plan-search'
import type { PlanListEntry } from '~/entities/plan/model/plan'
import { PlanRowCard } from '~/entities/plan/ui/plan-row-card'
import { QueryErrorAlert, SectionLoader } from '~/shared/ui'

export function PlanSearchableList ({
	filter,
	emptyMessage,
	noMatchMessage
}: {
	filter?: (entry: PlanListEntry) => boolean,
	emptyMessage: string,
	noMatchMessage: string
}) {
	const { data, isPending, error } = usePlansQuery()
	const [search, setSearch] = useState('')

	if (isPending) {
		return <SectionLoader />
	}

	if (error) {
		return <QueryErrorAlert title="Could not load plans" error={error} />
	}

	const filtered = filter === undefined ? data : data.filter(filter)
	const entries = sortPlansByRecency(filtered.filter((entry) => matchesPlanSearch(entry, search)))

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
					{filtered.length === 0 ? emptyMessage : noMatchMessage}
				</Text>
			) : null}

			{entries.map((entry) => (
				<PlanRowCard key={entry.id} entry={entry} />
			))}
		</Stack>
	)
}
