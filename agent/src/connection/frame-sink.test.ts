import { describe, expect, it, vi } from 'vitest';
import { createFrameSink } from './frame-sink';
import { type AgentMsg } from '../protocol';

const DONE = { type: 'exec.done', runId: 'sr_1', commitSha: 'abc', report: '' } as AgentMsg;
const ERROR = { type: 'exec.error', runId: 'sr_1', message: 'x' } as AgentMsg;
const TEXT = { type: 'exec.text', runId: 'sr_1', delta: 'hello' } as AgentMsg;

describe('createFrameSink', () => {
	// The whole point of the sink: a bullet that settles while the backend is
	// being deployed has to report when it comes back, or the run sits `running`
	// in the database with no process behind it.
	it('replays a frame that settled while nothing was attached', () => {
		const sink = createFrameSink();
		const deliver = vi.fn();

		sink.send(DONE);

		expect(deliver).not.toHaveBeenCalled();

		sink.attach(deliver);

		expect(deliver).toHaveBeenCalledWith(DONE);
	});

	it('keeps settling frames in the order they were produced', () => {
		const sink = createFrameSink();
		const deliver = vi.fn();

		sink.send(ERROR);
		sink.send(DONE);
		sink.attach(deliver);

		expect(deliver.mock.calls.map(([message]) => message)).toEqual([ERROR, DONE]);
	});

	// Buffering these would grow without bound for the length of the outage and
	// then redraw a transcript the browser already has.
	it('drops the live view rather than buffering it', () => {
		const sink = createFrameSink();
		const deliver = vi.fn();

		sink.send(TEXT);
		sink.attach(deliver);

		expect(deliver).not.toHaveBeenCalled();
	});

	// A frame queued on one connection and replayed on the next must not still be
	// queued for the one after that.
	it('does not replay the same frame onto a second connection', () => {
		const sink = createFrameSink();
		const first = vi.fn();
		const second = vi.fn();

		sink.send(DONE);
		sink.attach(first);
		sink.detach();
		sink.attach(second);

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
	});

	// Reported as held on `hello`. Without it the backend settles the run as
	// stranded, pauses the queue over a bullet that in fact landed, and hands the
	// same bullet out again on resume.
	it('reports the runs whose results are parked', () => {
		const sink = createFrameSink();

		sink.send(DONE);
		sink.send(TEXT);

		expect(sink.pendingRunIds()).toEqual(['sr_1']);
	});

	it('reports nothing once the parked results have flushed', () => {
		const sink = createFrameSink();

		sink.send(DONE);
		sink.attach(vi.fn());

		expect(sink.pendingRunIds()).toEqual([]);
	});

	it('sends straight through while a connection is attached', () => {
		const sink = createFrameSink();
		const deliver = vi.fn();

		sink.attach(deliver);
		sink.send(TEXT);

		expect(deliver).toHaveBeenCalledWith(TEXT);
	});
});
