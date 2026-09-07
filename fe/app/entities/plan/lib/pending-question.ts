import type { PlanMessage, PlanQuestion } from '~/entities/plan/model/plan'

export interface PendingQuestion {
	questionId: string
	questions: PlanQuestion[]
}

// `status = 'planning'` plus a question with no answer after it is the resume
// state — there is no column for it, because the transcript already holds it.
// Reopening a plan therefore re-renders the question from the same source that
// rendered it live.
export function findPendingQuestion (messages: PlanMessage[]): PendingQuestion | null {
	const answered = new Set(
		messages.flatMap((message) => (message.role === 'answer' ? [message.content.questionId] : []))
	)

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index]

		if (message?.role === 'question' && !answered.has(message.content.questionId)) {
			return { questionId: message.content.questionId, questions: message.content.questions }
		}
	}

	return null
}
