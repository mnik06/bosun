export type StreamEvent =
	| { kind: 'text'; delta: string }
	| { kind: 'tool'; name: string; subagent: boolean }
	| { kind: 'result'; ok: boolean; message: string };

export interface StreamParser {
	push(chunk: string): void;
	flush(): void;
}

function readContentBlocks(value: unknown): unknown[] {
	const message = (value as { message?: { content?: unknown } }).message;

	return Array.isArray(message?.content) ? message.content : [];
}

function eventsFromAssistant(value: unknown): StreamEvent[] {
	const subagent = Boolean((value as { parent_tool_use_id?: string | null }).parent_tool_use_id);

	return readContentBlocks(value)
		.filter(
			(block): block is { type: 'tool_use'; name: string } =>
				(block as { type?: string }).type === 'tool_use' &&
				typeof (block as { name?: unknown }).name === 'string'
		)
		.map((block) => ({ kind: 'tool', name: block.name, subagent }) satisfies StreamEvent);
}

function eventFromStreamEvent(value: unknown): StreamEvent | null {
	const frame = value as {
		event?: { type?: string; delta?: { type?: string; text?: string } };
		parent_tool_use_id?: string | null;
	};

	// Text produced inside a subagent belongs to that subagent's own transcript;
	// forwarding it would interleave two narrators in one chat.
	if (frame.parent_tool_use_id) {
		return null;
	}

	if (frame.event?.type !== 'content_block_delta' || frame.event.delta?.type !== 'text_delta') {
		return null;
	}

	const delta = frame.event.delta.text;

	return typeof delta === 'string' && delta.length > 0 ? { kind: 'text', delta } : null;
}

function eventFromResult(value: unknown): StreamEvent {
	const frame = value as { is_error?: boolean; subtype?: string; result?: unknown };
	const ok = frame.is_error !== true && frame.subtype === 'success';
	const message = typeof frame.result === 'string' ? frame.result : (frame.subtype ?? 'failed');

	return { kind: 'result', ok, message };
}

export function eventsFromFrame(value: unknown): StreamEvent[] {
	const type = (value as { type?: unknown }).type;

	if (type === 'stream_event') {
		const event = eventFromStreamEvent(value);

		return event ? [event] : [];
	}

	if (type === 'assistant') {
		return eventsFromAssistant(value);
	}

	if (type === 'result') {
		return [eventFromResult(value)];
	}

	return [];
}

// The CLI's stream-json shape is a looser contract than an npm package, so an
// unparseable or unrecognised line is reported and dropped rather than allowed
// to end the session — a new event type must not be able to kill a grill.
export function createStreamParser(opts: {
	onEvent: (event: StreamEvent) => void;
	onDropped: (line: string) => void;
}): StreamParser {
	let buffer = '';

	const handleLine = (line: string): void => {
		const trimmed = line.trim();

		if (trimmed.length === 0) {
			return;
		}

		let frame: unknown;

		try {
			frame = JSON.parse(trimmed);
		} catch {
			opts.onDropped(trimmed);

			return;
		}

		for (const event of eventsFromFrame(frame)) {
			opts.onEvent(event);
		}
	};

	return {
		push(chunk: string): void {
			buffer += chunk;

			const lines = buffer.split('\n');

			buffer = lines.pop() ?? '';
			lines.forEach(handleLine);
		},

		flush(): void {
			handleLine(buffer);
			buffer = '';
		}
	};
}
