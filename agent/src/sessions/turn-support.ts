// Three small pieces every session driver in `ask/`, `summary/`, `integration/`,
// `planning/`, `execution/` and `onboarding/` independently rebuilt around
// `spawnClaudeSession`. The drivers themselves stay separate — what each does
// with a finished turn is genuinely different — but these three jobs are the
// same wherever they appear.

// The tail of a session's stderr, kept to the last `maxChars` characters so a
// runaway process cannot grow the string held for its eventual error message
// without bound.
export function createStderrTail(maxChars: number): { push(chunk: string): void; value(): string } {
	let text = '';

	return {
		push(chunk: string): void {
			text = `${text}${chunk}`.slice(-maxChars);
		},
		value(): string {
			return text;
		}
	};
}

// A stream frame the parser could not read as a recognised claude event. Logged
// rather than thrown: one malformed line is not a reason to fail a whole turn.
export function logDroppedFrame(line: string): void {
	console.error(`dropped unrecognised claude frame: ${line.slice(0, 200)}`);
}

// A start that throws before the session produced any result of its own has
// nothing left to report through the session's own exit handling, so the
// caller tears down by hand and turns the failure into the one frame a session
// that started and then failed would have sent.
export async function reportStartFailure(opts: {
	attempt: () => Promise<void>;
	teardown: () => void;
	send: (message: string) => void;
}): Promise<void> {
	try {
		await opts.attempt();
	} catch (error) {
		opts.teardown();
		opts.send(error instanceof Error ? error.message : 'could not start the session');
	}
}
