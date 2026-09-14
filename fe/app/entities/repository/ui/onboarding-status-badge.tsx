import { Badge } from '@mantine/core'

import type { OnboardingStatus } from '~/entities/repository/model/repository'

const statusLook: Record<OnboardingStatus, { color: string, label: string }> = {
	discovering: { color: 'blue', label: 'discovering' },
	needs_input: { color: 'yellow', label: 'needs input' },
	verifying: { color: 'blue', label: 'verifying' },
	ready: { color: 'green', label: 'ready' },
	failed: { color: 'red', label: 'failed' }
}

export function OnboardingStatusBadge ({ status }: { status: OnboardingStatus }) {
	const look = statusLook[status]

	return (
		<Badge color={look.color} variant="light" size="sm">
			{look.label}
		</Badge>
	)
}
