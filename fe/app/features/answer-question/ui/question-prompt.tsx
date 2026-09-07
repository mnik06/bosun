import { Button, Card, Divider, Group, Stack } from '@mantine/core'
import { useState } from 'react'

import type { PendingQuestion } from '~/entities/plan'
import { useAnswerQuestion } from '~/features/answer-question/api/use-answer-question'
import { QuestionCard } from '~/features/answer-question/ui/question-card'

interface Draft {
	selected: string[]
	freeText: string
}

const EMPTY: Draft = { selected: [], freeText: '' }

function toggle (opts: { draft: Draft, label: string, multiSelect: boolean }): Draft {
	const { selected } = opts.draft

	if (!opts.multiSelect) {
		return { selected: [opts.label], freeText: '' }
	}

	return {
		freeText: '',
		selected: selected.includes(opts.label)
			? selected.filter((entry) => entry !== opts.label)
			: [...selected, opts.label]
	}
}

// Free text and options are one answer slot, not two: typing clears the picked
// options and picking clears the text, so what is sent back is never a mix the
// user did not mean.
function draftAnswer (draft: Draft): string[] {
	return draft.freeText.trim().length > 0 ? [draft.freeText.trim()] : draft.selected
}

export function QuestionPrompt ({
	planId,
	pending,
	disabled
}: {
	planId: string
	pending: PendingQuestion
	disabled: boolean
}) {
	const [drafts, setDrafts] = useState<Record<number, Draft>>({})
	const answer = useAnswerQuestion(planId)

	const answers = pending.questions.map((_, index) => draftAnswer(drafts[index] ?? EMPTY))
	const complete = answers.every((selected) => selected.length > 0)

	const patch = (index: number, next: Draft) => {
		setDrafts((previous) => ({ ...previous, [index]: next }))
	}

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				{pending.questions.map((question, index) => {
					const draft = drafts[index] ?? EMPTY

					return (
						<Stack key={question.header + String(index)} gap="md">
							{index === 0 ? null : <Divider />}
							<QuestionCard
								question={question}
								selected={draft.selected}
								freeText={draft.freeText}
								disabled={disabled || answer.isPending}
								onSelect={(label) => {
									patch(index, toggle({ draft, label, multiSelect: question.multiSelect }))
								}}
								onFreeText={(value) => {
									patch(index, { selected: [], freeText: value })
								}}
							/>
						</Stack>
					)
				})}

				<Group justify="end">
					<Button
						loading={answer.isPending}
						disabled={disabled || !complete}
						onClick={() => {
							answer.mutate({
								questionId: pending.questionId,
								answers: answers.map((selected) => ({ selected }))
							})
						}}
					>
						Answer
					</Button>
				</Group>
			</Stack>
		</Card>
	)
}
