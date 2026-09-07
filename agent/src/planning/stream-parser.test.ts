import { describe, expect, it, vi } from 'vitest';
import { createStreamParser, eventsFromFrame, type StreamEvent } from './stream-parser';

function collect(chunks: string[]): { events: StreamEvent[]; dropped: string[] } {
	const events: StreamEvent[] = [];
	const dropped: string[] = [];
	const parser = createStreamParser({
		onEvent: (event) => events.push(event),
		onDropped: (line) => dropped.push(line)
	});

	chunks.forEach((chunk) => parser.push(chunk));
	parser.flush();

	return { events, dropped };
}

const textFrame = (text: string, parent: string | null = null) =>
	JSON.stringify({
		type: 'stream_event',
		parent_tool_use_id: parent,
		event: { type: 'content_block_delta', delta: { type: 'text_delta', text } }
	});

describe('createStreamParser', () => {
	// The CLI writes to a pipe, so a frame arrives split at an arbitrary byte.
	// Reassembling across chunks is the parser's whole job.
	it('reassembles a frame split across chunks', () => {
		const frame = textFrame('hello');
		const { events } = collect([frame.slice(0, 20), `${frame.slice(20)}\n`]);

		expect(events).toEqual([{ kind: 'text', delta: 'hello' }]);
	});

	it('emits a trailing frame with no newline only on flush', () => {
		const { events } = collect([textFrame('tail')]);

		expect(events).toEqual([{ kind: 'text', delta: 'tail' }]);
	});

	// A new event type must not be able to kill a grill.
	it('drops an unparseable line and keeps going', () => {
		const { events, dropped } = collect([`not json\n${textFrame('after')}\n`]);

		expect(dropped).toEqual(['not json']);
		expect(events).toEqual([{ kind: 'text', delta: 'after' }]);
	});

	it('ignores blank lines', () => {
		const { events, dropped } = collect(['\n\n  \n']);

		expect(events).toEqual([]);
		expect(dropped).toEqual([]);
	});
});

describe('eventsFromFrame', () => {
	// Forwarding subagent text would interleave two narrators in one chat.
	it('drops text produced inside a subagent', () => {
		expect(eventsFromFrame(JSON.parse(textFrame('inner', 'toolu_1')))).toEqual([]);
	});

	it('reports tool use, flagging whether it was the subagent', () => {
		const frame = {
			type: 'assistant',
			parent_tool_use_id: 'toolu_1',
			message: { content: [{ type: 'tool_use', name: 'Read' }, { type: 'text', text: 'x' }] }
		};

		expect(eventsFromFrame(frame)).toEqual([{ kind: 'tool', name: 'Read', subagent: true }]);
	});

	it.each([
		[{ type: 'result', subtype: 'success', result: 'done' }, true],
		[{ type: 'result', subtype: 'success', is_error: true, result: 'nope' }, false],
		[{ type: 'result', subtype: 'error_during_execution' }, false]
	])('reads %o as ok=%s', (frame, ok) => {
		expect(eventsFromFrame(frame)).toEqual([expect.objectContaining({ kind: 'result', ok })]);
	});

	it('yields nothing for a frame type it does not know', () => {
		expect(eventsFromFrame({ type: 'system', subtype: 'init' })).toEqual([]);
	});
});

describe('parser wiring', () => {
	it('does not call onDropped for a recognised frame', () => {
		const onDropped = vi.fn();
		const parser = createStreamParser({ onEvent: () => {}, onDropped });

		parser.push(`${textFrame('x')}\n`);

		expect(onDropped).not.toHaveBeenCalled();
	});
});
