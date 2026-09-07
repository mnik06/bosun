import { Badge, Card, Group, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import clsx from 'clsx'

import type { PlanQuestion } from '~/entities/plan'

interface QuestionCardProps {
	question: PlanQuestion
	selected: string[]
	freeText: string
	disabled: boolean
	onSelect: (label: string) => void
	onFreeText: (value: string) => void
}

export function QuestionCard ({
	question,
	selected,
	freeText,
	disabled,
	onSelect,
	onFreeText
}: QuestionCardProps) {
	return (
		<Stack gap="sm">
			<Group gap="xs">
				<Badge variant="light">{question.header}</Badge>
				{question.multiSelect ? (
					<Text size="xs" c="dimmed">
						pick any number
					</Text>
				) : null}
			</Group>

			<Text fw={500}>{question.question}</Text>

			<Stack gap="xs">
				{question.options.map((option) => (
					<UnstyledButton
						key={option.label}
						disabled={disabled}
						onClick={() => {
							onSelect(option.label)
						}}
					>
						<Card
							withBorder
							padding="sm"
							radius="md"
							className={clsx(
								selected.includes(option.label) && 'bg-[var(--mantine-primary-color-light)]'
							)}
						>
							<Text fw={500} size="sm">
								{option.label}
							</Text>
							<Text size="xs" c="dimmed">
								{option.description}
							</Text>
						</Card>
					</UnstyledButton>
				))}
			</Stack>

			<TextInput
				label="Or answer in your own words"
				value={freeText}
				disabled={disabled}
				onChange={(event) => {
					onFreeText(event.currentTarget.value)
				}}
			/>
		</Stack>
	)
}
