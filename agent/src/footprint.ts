import { z } from 'zod';

// Mirrors `be/src/types/FootprintSchema.ts`. The descriptions are for the session
// filling in `publish_plan`; the shape is the backend's, which compares plans over
// it at approval and never asks a model what waits for what.

export const SchemaChangeSchema = z.object({
	op: z
		.enum(['create_table', 'add_column', 'alter_column', 'drop'])
		.describe('create_table and add_column create a piece; alter_column and drop change one'),
	table: z.string().trim().min(1).max(120),
	column: z.string().trim().min(1).max(120).optional().describe('the column, for add_column, alter_column and a dropped column'),
	definition: z
		.string()
		.max(4000)
		.default('')
		.describe('the full definition as the plan settles it — type, nullability, default, references — compared with another plan creating the same piece')
});

export const ContractChangeSchema = z.object({
	op: z.enum(['create', 'change']),
	method: z.string().trim().min(1).max(10),
	path: z.string().trim().min(1).max(300).describe('the route, with parameters as :name'),
	shape: z.string().max(4000).default('').describe('the request and response payload shape, as pasted in the plan')
});

export const ModuleChangeSchema = z.object({
	op: z.enum(['create', 'change']),
	path: z.string().trim().min(1).max(300).describe('the file, relative to the repository root'),
	symbol: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.optional()
		.describe('the exported symbol other code consumes; leave it out for a file that is only touched, which never makes a dependency')
});

export const ConsumedPieceSchema = z.object({
	planNumber: z.number().int().positive().describe('the approved plan that creates or changes the piece'),
	item: z
		.string()
		.trim()
		.min(1)
		.max(500)
		.describe('the piece\'s key: table:<table>, column:<table>.<column>, contract:<METHOD> <path with :param>, module:<path> or module:<path>#<Symbol>')
});

export const FootprintSchema = z.object({
	schema: z.array(SchemaChangeSchema).max(50).default([]),
	contracts: z.array(ContractChangeSchema).max(50).default([]),
	modules: z.array(ModuleChangeSchema).max(100).default([]),
	consumes: z.array(ConsumedPieceSchema).max(50).default([]).describe('pieces of another approved plan this bullet uses instead of building its own copy')
});

export type Footprint = z.infer<typeof FootprintSchema>;
