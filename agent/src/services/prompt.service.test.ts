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
