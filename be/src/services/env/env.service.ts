import 'dotenv/config';
import { EnvSchema, type Env } from 'src/types/EnvSchema';

export function getEnv(): Env {
	return EnvSchema.parse(process.env);
}
