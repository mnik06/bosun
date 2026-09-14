import { Group, Loader, Stack, Text, ThemeIcon } from '@mantine/core'
import { Check, Dot, X } from 'lucide-react'

import type { OnboardingStep } from '~/entities/repository'

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

export function OnboardingSteps ({ steps }: { steps: OnboardingStep[] }) {
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
		</Stack>
	)
}
