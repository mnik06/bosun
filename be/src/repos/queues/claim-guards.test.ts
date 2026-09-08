import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { noItemInFlight } from 'src/repos/queues/queue-item.repo';
import { noRunInFlight } from 'src/repos/queues/slice-run.repo';
import { queueItems, sliceRuns } from 'src/services/drizzle/schema';

const db = drizzle(postgres('postgres://unused/unused', { max: 1 }), { casing: 'snake_case' });

// Both claims are conditional UPDATEs, so what they do under concurrency is a
// property of the SQL rather than of any path a mock can drive.
describe('claim guards', () => {
	// The bug: a settling bullet advances its queue directly and again through the
	// machine sweep. The `id = (lowest pending)` clause stops both calls taking the
	// same row — it does nothing about them taking different ones, so two sessions
	// started in one worktree 0.4 seconds apart and both bullets span in the
	// browser at once.
	it('refuses a run while another run of the same item is in flight', () => {
		const { sql, params } = db
			.select({ ok: noRunInFlight('qi_1') })
			.from(sliceRuns)
			.toSQL();

		expect(sql.replace(/\s+/g, ' ')).toContain(
			'not exists (select 1 from "slice_runs" where queue_item_id = $1 and status = \'running\')'
		);
		expect(params).toEqual(['qi_1']);
	});

	// Same shape one level up: two advances claiming two different plans into one
	// queue is one worktree, two branches, and two sessions writing over each
	// other.
	it('refuses a plan while another plan of the same queue is in flight', () => {
		const { sql, params } = db
			.select({ ok: noItemInFlight('q_1') })
			.from(queueItems)
			.toSQL();

		expect(sql.replace(/\s+/g, ' ')).toContain(
			'not exists (select 1 from "queue_items" where queue_id = $1 and status = \'running\')'
		);
		expect(params).toEqual(['q_1']);
	});
});
