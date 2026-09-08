import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { nextPortBase } from 'src/repos/queues/queue.repo';
import { queues } from 'src/services/drizzle/schema';

// postgres-js does not dial until a query runs, so this renders SQL and touches
// no database.
const db = drizzle(postgres('postgres://unused/unused', { max: 1 }), { casing: 'snake_case' });

function rendered() {
	return db.select({ portBase: nextPortBase('m_1') }).from(queues).toSQL();
}

describe('nextPortBase', () => {
	// The bug this exists for: a number reaching Postgres through a bound
	// parameter arrives untyped, and arithmetic between two of those fails the
	// whole statement with `operator is not unique: unknown - unknown`. It
	// typechecks, every mocked test passes, and it 500s the first time anybody
	// creates a queue — so the assertion has to be on the SQL, not the behaviour.
	it('binds the machine and nothing else', () => {
		expect(rendered().params).toEqual(['m_1']);
	});

	it('writes both port constants into the statement', () => {
		const { sql } = rendered();

		expect(sql).toContain('+ 10');
		expect(sql).toContain('4100');
	});

	// max() over no rows is null, so the fallback is what the first queue on a
	// machine gets. Adding the stride outside the coalesce would hand it 4110.
	it('adds the stride inside the coalesce so the first queue starts at the base', () => {
		expect(rendered().sql.replace(/\s+/g, ' ')).toContain('coalesce(max("port_base") + 10, 4100)');
	});
});
