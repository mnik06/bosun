import { describe, expect, it, vi } from 'vitest';
import { createAskTool, type PendingQuestion } from './mcp-server';
import { type PlanAnswer, type PlanQuestion } from '../protocol';

function question(overrides: Partial<PlanQuestion> = {}): PlanQuestion {
	return {
		header: 'Storage',
		question: 'Where do sessions live?',
		options: [
			{ label: 'Postgres (Recommended)', description: 'One store' },
			{ label: 'Redis', description: 'Another process' }
		],
		multiSelect: false,
		...overrides
	};
}

function build(opts: { auto?: boolean } = {}) {
	const pending = new Map<string, PendingQuestion>();
	const onQuestion = vi.fn();
	const onAnswered = vi.fn();
	const ask = createAskTool({ pending, onQuestion, auto: opts.auto, onAnswered });

	const answerLatest = (answers: PlanAnswer[]): void => {
		const [entry] = [...pending.values()];

		pending.delete(entry!.questionId);
		entry!.resolve(answers);
	};

	return { ask, onQuestion, onAnswered, pending, answerLatest };
}

function textOf(result: unknown): string {
	return (result as { content: { text: string }[] }).content[0]!.text;
}

describe('createAskTool', () => {
	// A model that re-asks has lost the tool result — a compaction, a restarted
	// turn — and putting the same decision to the person twice is what reads as
	// the grill going in circles.
	it('answers a repeat of an answered question without asking again', async () => {
		const { ask, onQuestion, answerLatest } = build();
		const first = ask({ questions: [question()] });

		answerLatest([{ selected: ['Postgres (Recommended)'] }]);
		await first;

		const repeat = textOf(await ask({ questions: [question()] }));

		expect(onQuestion).toHaveBeenCalledTimes(1);
		expect(repeat).toContain('Postgres (Recommended)');
	});

	// The second call cannot be waited on by the model — it is blocked inside the
	// first — so emitting it would leave a prompt on screen nobody reads.
	it('joins a second call for a question already waiting', async () => {
		const { ask, onQuestion, answerLatest } = build();
		const first = ask({ questions: [question()] });
		const second = ask({ questions: [question()] });

		expect(onQuestion).toHaveBeenCalledTimes(1);

		answerLatest([{ selected: ['Redis'] }]);

		expect(textOf(await first)).toContain('Redis');
		expect(textOf(await second)).toContain('Redis');
	});

	it('asks again when the options differ', async () => {
		const { ask, onQuestion, answerLatest } = build();
		const first = ask({ questions: [question()] });

		answerLatest([{ selected: ['Redis'] }]);
		await first;

		const next = ask({
			questions: [
				question({ options: [{ label: 'Redis cluster', description: 'Sharded' }] })
			]
		});

		expect(onQuestion).toHaveBeenCalledTimes(2);
		answerLatest([{ selected: ['Redis cluster'] }]);
		await next;
	});

	// Auto mode runs the identical grill, so the same repeat has to collapse — a
	// duplicate there writes a second question row into the transcript.
	it('collapses a repeat in auto mode too', async () => {
		const { ask, onQuestion, onAnswered } = build({ auto: true });

		await ask({ questions: [question()] });
		await ask({ questions: [question()] });

		expect(onQuestion).toHaveBeenCalledTimes(1);
		expect(onAnswered).toHaveBeenCalledTimes(1);
	});

	// `close()` releases a waiting question with nothing, so that the `claude`
	// process can exit. Remembering it would answer every later ask with silence.
	it('does not remember an empty answer as a ruling', async () => {
		const { ask, onQuestion, onAnswered, answerLatest } = build();
		const first = ask({ questions: [question()] });

		answerLatest([]);
		await first;

		const second = ask({ questions: [question()] });

		expect(onQuestion).toHaveBeenCalledTimes(2);
		expect(onAnswered).not.toHaveBeenCalled();

		answerLatest([{ selected: ['Redis'] }]);
		await second;
	});
});
