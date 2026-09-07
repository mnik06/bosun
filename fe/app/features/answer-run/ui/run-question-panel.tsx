import { Alert, Button, Radio, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'

import type { RunQuestionMsg } from '~/entities/machine'
import { useAnswerRun } from '~/features/answer-run/api/use-answer-run'

export function RunQuestionPanel ({ question }: { question: RunQuestionMsg }) {
	const [picked, setPicked] = useState<Record<number, string>>({})
	const answer = useAnswerRun(question.runId)
	const ready = question.questions.every((_, index) => (picked[index] ?? '') !== '')

	return (
		<Alert color="orange" variant="light" title="This queue is waiting on you">
			<Stack gap="md">
				{question.questions.map((entry, index) => (
					<Stack key={entry.header} gap="xs">
						<Text size="sm" fw={600}>
							{entry.question}
						</Text>

						<Radio.Group
							value={picked[index] ?? ''}
							onChange={(value) => {
								setPicked((previous) => ({ ...previous, [index]: value }))
							}}
						>
							<Stack gap={6}>
								{entry.options.map((option) => (
									<Radio
										key={option.label}
										value={option.label}
										label={option.label}
										description={option.description}
									/>
								))}
							</Stack>
						</Radio.Group>

						<TextInput
							size="xs"
							placeholder="…or type your own answer"
							onChange={(event) => {
								setPicked((previous) => ({ ...previous, [index]: event.currentTarget.value }))
							}}
						/>
					</Stack>
				))}

				<Button
					size="xs"
					loading={answer.isPending}
					disabled={!ready}
					onClick={() => {
						answer.mutate({
							questionId: question.questionId,
							answers: question.questions.map((_, index) => ({
								selected: [picked[index] ?? '']
							}))
						})
					}}
				>
					Answer and carry on
				</Button>
			</Stack>
		</Alert>
	)
}
