import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle-out',
	schema: './src/services/drizzle/schema.ts',
	dialect: 'postgresql',
	casing: 'snake_case',
	dbCredentials: {
		url: process.env.DIRECT_URL || process.env.DATABASE_URL!
	}
});
