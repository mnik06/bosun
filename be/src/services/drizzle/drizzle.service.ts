import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export function getDb(opts: { databaseUrl: string; logsEnabled: boolean }) {
	return drizzle({
		casing: 'snake_case',
		logger: opts.logsEnabled,
		client: postgres(opts.databaseUrl, { prepare: false, max: 5 })
	});
}

export type Db = ReturnType<typeof getDb>;

// A repo built inside `db.transaction` receives the transaction handle, which
// carries every query method but not the pool client. Typing repos against this
// is what lets one repo serve both a plain call and a transactional one.
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
