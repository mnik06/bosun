import { describe, expect, it } from 'vitest'

import { findPendingQuestion } from '~/entities/plan/lib/pending-question'
import type { PlanMessage, PlanQuestion } from '~/entities/plan/model/plan'

const question: PlanQuestion = {
	header: 'Storage',
	question: 'Where does it live?',
	options: [{ label: 'Postgres', description: 'One table' }],
	multiSelect: false
}

function ask (opts: { seq: number, questionId: string }): PlanMessage {
	return {
		id: `pm_q${String(opts.seq)}`,
		planId: 'p_1',
		seq: opts.seq,
		role: 'question',
		content: { questionId: opts.questionId, questions: [question] },
		createdAt: '2026-01-01T00:00:00.000Z'
	}
}

function reply (opts: { seq: number, questionId: string }): PlanMessage {
	return {
		id: `pm_a${String(opts.seq)}`,
		planId: 'p_1',
		seq: opts.seq,
		role: 'answer',
		content: { questionId: opts.questionId, answers: [{ selected: ['Postgres'] }] },
		createdAt: '2026-01-01T00:00:00.000Z'
	}
}

describe('findPendingQuestion', () => {
	it('finds nothing in a transcript with no questions', () => {
		expect(findPendingQuestion([])).toBeNull()
	})

	it('finds the question that has no answer after it', () => {
		const messages = [ask({ seq: 1, questionId: 'q_1' }), reply({ seq: 2, questionId: 'q_1' }), ask({ seq: 3, questionId: 'q_2' })]

		expect(findPendingQuestion(messages)?.questionId).toBe('q_2')
	})

	it('finds nothing once every question is answered', () => {
		const messages = [ask({ seq: 1, questionId: 'q_1' }), reply({ seq: 2, questionId: 'q_1' })]

		expect(findPendingQuestion(messages)).toBeNull()
	})

	// The answer is matched by questionId rather than by position: an answer that
	// lands while a later question is already on screen must not silently retire
	// the wrong one.
	it('matches the answer to its own question, not the last one', () => {
		const messages = [
			ask({ seq: 1, questionId: 'q_1' }),
			ask({ seq: 2, questionId: 'q_2' }),
			reply({ seq: 3, questionId: 'q_2' })
		]

		expect(findPendingQuestion(messages)?.questionId).toBe('q_1')
	})
})
