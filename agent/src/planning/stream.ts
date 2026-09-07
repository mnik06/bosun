export type StreamEvent =
	| { kind: 'text'; delta: string }
	| { kind: 'tool'; name: string; subagent: boolean }
	| { kind: 'result'; ok: boolean; message: string };

interface StreamParser {
	push(chunk: string): void;
	flush(): void;
}

// Tools are counted by the label they render, not by their own name. Grep and
// Glob both read as "searched the codebase", so counting them separately makes
// the number visibly go backwards as the two interleave.
const TOOL_BUCKETS: Record<string, string> = {
	Read: 'read',
	NotebookRead: 'read',
	Grep: 'search',
	Glob: 'search'
};

const TOOL_LABELS: Record<string, string> = {
	// The CLI names the subagent tool `Agent`; `Task` is kept because the name has
	// changed once already and an unlabelled tool reads as "Running Task".
	Agent: 'Exploring the codebase',
	Task: 'Exploring the codebase',
	WebFetch: 'Reading documentation',
	WebSearch: 'Searching the web',
	mcp__bosun__bosun_ask: 'Waiting for your answer',
	mcp__bosun__create_plan: 'Writing the plan',
	mcp__bosun__add_ac: 'Recording acceptance criteria',
	mcp__bosun__create_slice: 'Cutting tracer bullets'
};

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function activityBucket(opts: { tool: string; subagent: boolean }): string {
	const bucket = TOOL_BUCKETS[opts.tool] ?? opts.tool;

	return opts.subagent ? `sub:${bucket}` : bucket;
}

// Work done inside the recon subagent is shown, not hidden: it is the only sign
// of life during a sweep that can run for minutes. It is attributed to the
// subagent rather than folded into the session's own counters, because a session
// that read ten files should not claim it read a hundred.
export function describeToolActivity(opts: {
	tool: string;
	count: number;
	subagent: boolean;
}): string {
	const bucket = TOOL_BUCKETS[opts.tool] ?? opts.tool;

	if (bucket === 'read') {
		const label = `Read ${plural(opts.count, 'file')}`;

		return opts.subagent ? `Exploring the codebase — read ${plural(opts.count, 'file')}` : label;
	}

	if (bucket === 'search') {
		const times = opts.count === 1 ? 'once' : `${opts.count} times`;

		return opts.subagent
			? `Exploring the codebase — searched ${times}`
			: `Searched the codebase ${times}`;
	}

	const label = TOOL_LABELS[opts.tool] ?? `Running ${opts.tool}`;

	return opts.subagent ? `Exploring the codebase — ${label.toLowerCase()}` : label;
}

// A tool the parser has never seen still produces a line the browser can show,
// so a new builtin does not make the session look frozen.
export function createActivityTracker(): {
	label(opts: { tool: string; subagent: boolean }): string;
} {
	const counts = new Map<string, number>();

	return {
		label(opts): string {
			const bucket = activityBucket(opts);
			const count = (counts.get(bucket) ?? 0) + 1;

			counts.set(bucket, count);

			return describeToolActivity({ ...opts, count });
		}
	};
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

function eventsFromFrame(value: unknown): StreamEvent[] {
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
