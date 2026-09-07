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
