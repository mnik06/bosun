import { describe, expect, it } from 'vitest';
import { activityBucket, createActivityTracker, describeToolActivity } from './activity-labels';

describe('activityBucket', () => {
	// Grep and Glob both render as "searched the codebase", so counting them apart
	// makes the number visibly go backwards as the two interleave.
	it('folds tools that render the same label into one bucket', () => {
		expect(activityBucket({ tool: 'Grep', subagent: false })).toBe(
			activityBucket({ tool: 'Glob', subagent: false })
		);
		expect(activityBucket({ tool: 'Read', subagent: false })).toBe(
			activityBucket({ tool: 'NotebookRead', subagent: false })
		);
	});

	// A session that read ten files must not claim it read a hundred because its
	// recon subagent did.
	it('keeps subagent work in its own bucket', () => {
		expect(activityBucket({ tool: 'Read', subagent: true })).not.toBe(
			activityBucket({ tool: 'Read', subagent: false })
		);
	});
});

describe('describeToolActivity', () => {
	it.each([
		[{ tool: 'Read', count: 1, subagent: false }, 'Read 1 file'],
		[{ tool: 'Read', count: 3, subagent: false }, 'Read 3 files'],
		[{ tool: 'Grep', count: 1, subagent: false }, 'Searched the codebase once'],
		[{ tool: 'Grep', count: 4, subagent: false }, 'Searched the codebase 4 times'],
		[{ tool: 'WebSearch', count: 1, subagent: false }, 'Searching the web']
	])('%o -> %s', (opts, expected) => {
		expect(describeToolActivity(opts)).toBe(expected);
	});

	it('attributes subagent work to the exploration', () => {
		expect(describeToolActivity({ tool: 'Read', count: 2, subagent: true })).toBe(
			'Exploring the codebase — read 2 files'
		);
	});

	// A new builtin must not make the session look frozen.
	it('still labels a tool it has never seen', () => {
		expect(describeToolActivity({ tool: 'Frobnicate', count: 1, subagent: false })).toBe(
			'Running Frobnicate'
		);
	});
});

describe('createActivityTracker', () => {
	it('counts within a bucket across the tools that share it', () => {
		const tracker = createActivityTracker();

		expect(tracker.label({ tool: 'Grep', subagent: false })).toBe('Searched the codebase once');
		expect(tracker.label({ tool: 'Glob', subagent: false })).toBe('Searched the codebase 2 times');
	});

	it('counts the subagent separately from the session', () => {
		const tracker = createActivityTracker();

		tracker.label({ tool: 'Read', subagent: true });

		expect(tracker.label({ tool: 'Read', subagent: false })).toBe('Read 1 file');
	});
});
