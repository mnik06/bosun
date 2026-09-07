import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import clsx from 'clsx'
import { CheckIcon } from 'lucide-react'

import type { PlanAnswer, PlanQuestion } from '~/entities/plan/model/plan'

export function AnsweredQuestion ({
	questions,
	answers
}: {
	questions: PlanQuestion[]
	answers: PlanAnswer[]
}) {
	return (
		<Stack gap="md">
			{questions.map((question, index) => {
				const selected = answers[index]?.selected ?? []
				const freeText = selected.filter(
					(entry) => !question.options.some((option) => option.label === entry)
				)

				return (
					<Stack key={question.header + String(index)} gap="xs">
						<Group gap="xs">
							<Badge variant="light">{question.header}</Badge>
						</Group>
						<Text fw={500} size="sm">
							{question.question}
						</Text>

						{question.options.map((option) => (
							<Card
								key={option.label}
								withBorder
								padding="xs"
								radius="md"
								className={clsx(
									selected.includes(option.label) && 'bg-[var(--mantine-primary-color-light)]'
								)}
							>
								<Group gap="xs" wrap="nowrap">
									{selected.includes(option.label) ? <CheckIcon size={14} /> : null}
									<Text size="sm" fw={selected.includes(option.label) ? 600 : 400}>
										{option.label}
									</Text>
								</Group>
							</Card>
						))}

						{freeText.length === 0 ? null : (
							<Text size="sm" fw={600}>
								{freeText.join(', ')}
							</Text>
						)}
					</Stack>
				)
			})}
		</Stack>
	)
}
