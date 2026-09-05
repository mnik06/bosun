import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export function getDb(opts: { databaseUrl: string; logsEnabled: boolean }) {
	return drizzle({
		casing: 'snake_case',
		logger: opts.logsEnabled,
		client: postgres(opts.databaseUrl, { prepare: false, max: 5 })
	});
}
