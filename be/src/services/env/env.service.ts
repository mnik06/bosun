import 'dotenv/config';
import { EnvSchema } from 'src/types/EnvSchema';

EnvSchema.parse(process.env);
