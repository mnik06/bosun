import { Group, Loader, Stack, Text, ThemeIcon } from '@mantine/core'
import { Check, Dot, X } from 'lucide-react'

import type { OnboardingStep } from '~/entities/repository'
import { useNow } from '~/shared/hooks'
import { formatRelativeTime } from '~/shared/lib'
import type { PendingStep } from '~/widgets/onboarding-report/lib/display-steps'

const PENDING_TICK_MS = 15_000

function StepIcon ({ status }: { status: OnboardingStep['status'] }) {
	switch (status) {
		case 'passed':
			return <ThemeIcon color="green" size={18} radius="xl"><Check size={11} /></ThemeIcon>
		case 'failed':
			return <ThemeIcon color="red" size={18} radius="xl"><X size={11} /></ThemeIcon>
		case 'running':
			return <Loader size={16} />
		case 'info':
			return <ThemeIcon color="gray" variant="light" size={18} radius="xl"><Dot size={14} /></ThemeIcon>
	}
}

function PendingRow ({ pending }: { pending: PendingStep }) {
	useNow(PENDING_TICK_MS)

	return (
		<Group gap="sm" align="start" wrap="nowrap">
			<Loader size={16} />
			<Stack gap={2} className="min-w-0">
				<Text size="sm">{pending.label}</Text>
				<Text size="xs" c="dimmed">
					last update {formatRelativeTime(pending.since)}
				</Text>
			</Stack>
		</Group>
	)
}

export function OnboardingSteps ({ steps, pending }: { steps: OnboardingStep[], pending: PendingStep | null }) {
	return (
		<Stack gap={6}>
			{steps.map((step, index) => (
				<Group key={`${step.at}:${index}`} gap="sm" align="start" wrap="nowrap">
					<StepIcon status={step.status} />
					<Stack gap={2} className="min-w-0">
						<Text size="sm">{step.label}</Text>
						{step.detail === null ? null : (
							<Text size="xs" c="dimmed" className="font-mono break-all whitespace-pre-wrap">
								{step.detail}
							</Text>
						)}
					</Stack>
				</Group>
			))}
			{pending === null ? null : <PendingRow pending={pending} />}
		</Stack>
	)
}
