import { PassThrough } from 'stream';
import { describe, expect, it } from 'vitest';
import { getPromptService } from './prompt.service';

function harness(lines: string[]) {
	const input = new PassThrough();
	const output = new PassThrough();
	const written: string[] = [];

	output.on('data', (chunk: Buffer) => written.push(chunk.toString()));

	const prompt = getPromptService({ input, output });

	// Written in one go, the way a piped heredoc or a fast paste arrives.
	setImmediate(() => {
		input.end(lines.map((line) => `${line}\n`).join(''));
	});

	return { prompt, written };
}

describe('getPromptService', () => {
	it('reads a single answer', async () => {
		const { prompt } = harness(['hello']);

		expect(await prompt.ask('q: ')).toBe('hello');
	});

	// The bug this exists for: over a pipe readline emits every line as fast as it
	// can read, so a second prompt registered afterwards had already missed its
	// answer and the confirm silently read as "no".
	it('answers a sequence of prompts from one burst of input', async () => {
		const { prompt } = harness(['a-token', 'y']);

		expect(await prompt.secret('token')).toBe('a-token');
		expect(await prompt.confirm('write it?')).toBe(true);
	});

	it.each([
		['y', true],
		['Y', true],
		['yes', true],
		['n', false],
		['', false],
		['nope', false]
	])('reads %j as %s', async (answer, expected) => {
		const { prompt } = harness([answer]);

		expect(await prompt.confirm('go?')).toBe(expected);
	});

	it('trims surrounding whitespace', async () => {
		const { prompt } = harness(['  padded  ']);

		expect(await prompt.ask('q: ')).toBe('padded');
	});

	// Without this a closed stdin leaves the process waiting on input that is
	// never coming.
	it('resolves empty at EOF instead of hanging', async () => {
		const { prompt } = harness([]);

		expect(await prompt.ask('q: ')).toBe('');
	});

	it('writes the prompt to the output', async () => {
		const { prompt, written } = harness(['x']);

		await prompt.ask('the question: ');

		expect(written.join('')).toContain('the question: ');
	});

	// Not a TTY, so there is no echo to suppress and no cursor control to emit.
	it('keeps escape sequences out of a piped output', async () => {
		const { prompt, written } = harness(['secret']);

		await prompt.secret('token');

		expect(written.join('')).not.toContain(String.fromCharCode(27));
	});
});

describe('secretBlock', () => {
	// The bug this exists for: `claude setup-token` prints a token wider than a
	// terminal, and a copy taken off the screen carries the wrap back as a newline.
	// Read as one line, the token loses everything after the first row and the API
	// refuses it — with the input hidden, nothing on screen says why.
	it('rejoins a token the terminal wrapped', async () => {
		const { prompt } = harness(['sk-ant-oat01-firstrow', 'secondrow', '']);

		expect(await prompt.secretBlock('Claude token')).toBe('sk-ant-oat01-firstrowsecondrow');
	});

	it('reads a token that did not wrap', async () => {
		const { prompt } = harness(['sk-ant-oat01-whole', '']);

		expect(await prompt.secretBlock('Claude token')).toBe('sk-ant-oat01-whole');
	});

	// Every fragment is part of one value, so whitespace in it came from the
	// display rather than from the token.
	it('strips whitespace the display introduced', async () => {
		const { prompt } = harness(['  sk-ant-oat01-first ', ' second  ', '']);

		expect(await prompt.secretBlock('Claude token')).toBe('sk-ant-oat01-firstsecond');
	});

	// EOF with no blank line is what a piped heredoc looks like.
	it('ends at EOF as well as at a blank line', async () => {
		const { prompt } = harness(['sk-ant-oat01-piped']);

		expect(await prompt.secretBlock('Claude token')).toBe('sk-ant-oat01-piped');
	});

	it('reads nothing when the first line is empty', async () => {
		const { prompt } = harness(['', 'ignored']);

		expect(await prompt.secretBlock('Claude token')).toBe('');
	});
});

describe('secretBlock with a completion check', () => {
	// Input delivered as separate, unended writes, the way a live terminal feeds a
	// process one keystroke burst at a time — unlike `harness()`, which closes the
	// stream up front and so cannot tell an early return from one that only
	// happened because EOF forced it.
	function liveHarness() {
		const input = new PassThrough();
		const output = new PassThrough();
		const prompt = getPromptService({ input, output });

		return {
			prompt,
			write: (chunk: string) => input.write(chunk),
			end: () => input.end()
		};
	}

	const PENDING = Symbol('pending');

	// Races a promise against a short timer so a test can assert "still waiting"
	// without actually hanging when the wait is the point of the test.
	function settledWithin(promise: Promise<unknown>, ms: number): Promise<unknown> {
		return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(PENDING), ms))]);
	}

	const isComplete = (value: string): boolean => value.startsWith('sk-ant-oat01-') && value.length > 20;

	// AC-1: a clean, non-wrapped paste followed by exactly one Enter resolves on
	// its own — proven here by resolving before the stream is ever closed, which a
	// wait for blank-line-or-EOF could not do.
	it('submits a single-line paste on one Enter, without waiting for a blank line', async () => {
		const { prompt, write } = liveHarness();
		const result = prompt.secretBlock('Claude token', { isComplete });

		write('sk-ant-oat01-wholetokenwithplentyoflength\n');

		expect(await settledWithin(result, 50)).toBe('sk-ant-oat01-wholetokenwithplentyoflength');
	});

	// AC-2: a terminal's line wrap turns a paste into two newline-separated rows
	// that arrive in the same read. The first row alone already satisfies
	// `isComplete` here, so this only holds if the still-queued second row is what
	// stops the early return — proving the `ready` gate, not just the check itself.
	it('still reassembles a token wrapped across rows delivered in one chunk', async () => {
		const { prompt, write } = liveHarness();
		const result = prompt.secretBlock('Claude token', { isComplete: (value) => value.length >= 5 });

		write('sk-ant-\noat01-wholetoken\n');

		expect(await settledWithin(result, 50)).toBe('sk-ant-oat01-wholetoken');
	});

	// AC-3: a value the check never accepts must not be auto-submitted — proven
	// by showing the prompt is still pending after it arrives, then that a blank
	// line is what finally resolves it.
	it('waits for a blank line when the value never looks complete', async () => {
		const { prompt, write, end } = liveHarness();
		const result = prompt.secretBlock('Claude token', { isComplete });

		write('not-a-token\n');

		expect(await settledWithin(result, 50)).toBe(PENDING);

		end();

		expect(await result).toBe('not-a-token');
	});
});
