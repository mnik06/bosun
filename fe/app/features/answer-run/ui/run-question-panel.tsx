import { Alert, Button, Radio, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'

import type { PendingRunQuestion } from '~/entities/plan'
import { useAnswerRun } from '~/features/answer-run/api/use-answer-run'

export function RunQuestionPanel ({ planId, pending }: { planId: string, pending: PendingRunQuestion }) {
	const [picked, setPicked] = useState<Record<number, string>>({})
	const answer = useAnswerRun({ runId: pending.runId, planId })
	const ready = pending.questions.every((_, index) => (picked[index] ?? '') !== '')

	// Past ten minutes the session gave its slot back; the answer then restarts the
	// bullet at the front of the line rather than reaching a session still waiting.
	const title = pending.released
		? 'A bullet asked a question and gave its slot back — answering restarts it'
		: 'A bullet is waiting on you'

	return (
		<Alert color="orange" variant="light" title={title}>
			<Stack gap="md">
				{pending.questions.map((entry, index) => (
					<Stack key={`${entry.header}-${String(index)}`} gap="xs">
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
								// Read before the updater runs: React clears `currentTarget`
								// once the handler returns.
								const { value } = event.currentTarget

								setPicked((previous) => ({ ...previous, [index]: value }))
							}}
						/>
					</Stack>
				))}

				<Button
					size="xs"
					loading={answer.isPending}
					disabled={!ready}
					className="self-start"
					onClick={() => {
						answer.mutate({
							questionId: pending.questionId,
							answers: pending.questions.map((_, index) => ({ selected: [picked[index] ?? ''] }))
						})
					}}
				>
					Answer and carry on
				</Button>
			</Stack>
		</Alert>
	)
}
