import { Stack } from '@mantine/core'

import { IntegrationCard, type PlanDetail } from '~/entities/plan'

export function PlanSync ({ detail }: { detail: PlanDetail }) {
	const integrations = [...detail.integrations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

	return (
		<Stack gap="xs">
			{integrations.map((integration) => (
				<IntegrationCard key={integration.id} integration={integration} />
			))}
		</Stack>
	)
}
