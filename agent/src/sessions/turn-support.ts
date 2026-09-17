import { type StreamParser } from '../planning/stream-parser';

// Four small pieces every session driver in `ask/`, `summary/`, `integration/`,
// `planning/`, `execution/` and `onboarding/` independently rebuilt around
// `spawnClaudeSession`. The drivers themselves stay separate — what each does
// with a finished turn is genuinely different — but these jobs are the same
// wherever they appear.

export interface StderrTail {
	push(chunk: string): void;
	value(): string;
}

// The tail of a session's stderr, kept to the last `maxChars` characters so a
// runaway process cannot grow the string held for its eventual error message
// without bound.
export function createStderrTail(maxChars: number): StderrTail {
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

// The prelude every session-spawn site wires the same way: stdout feeds the
// stream parser, stderr is kept in case nothing else says what went wrong, and
// the parser is flushed before the site's own exit handling — settling a
// promise, checking a Set, failing a state machine — looks at what arrived.
// `tag` is the one thing that differs site to site: given, stderr is echoed to
// the console as it arrives so it lands in the journal even when the session
// never reaches an error; omitted, nothing is echoed.
export function pipeSessionOutput(opts: {
	parser: StreamParser;
	stderr: StderrTail;
	tag?: string;
}): {
	onStdout: (chunk: string) => void;
	onStderr: (chunk: string) => void;
	onExit: () => void;
} {
	return {
		onStdout: (chunk) => {
			opts.parser.push(chunk);
		},
		onStderr: (chunk) => {
			opts.stderr.push(chunk);

			if (opts.tag !== undefined) {
				console.error(`[${opts.tag}] ${chunk.trimEnd()}`);
			}
		},
		onExit: () => {
			opts.parser.flush();
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
