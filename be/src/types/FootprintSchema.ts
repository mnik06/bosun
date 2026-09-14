import { z } from 'zod';

// What a bullet declares it will change. The planning prompt already makes a plan
// settle its schema and contracts completely; this records them as data, because
// dependencies are compared over it deterministically at approval and a model is
// never asked what waits for what.

export const SchemaChangeSchema = z.object({
	op: z.enum(['create_table', 'add_column', 'alter_column', 'drop']),
	table: z.string().trim().min(1).max(120),
	column: z.string().trim().min(1).max(120).optional(),
	definition: z.string().max(4000).default('')
});

export type SchemaChange = z.infer<typeof SchemaChangeSchema>;

export const ContractChangeSchema = z.object({
	op: z.enum(['create', 'change']),
	method: z.string().trim().min(1).max(10),
	path: z.string().trim().min(1).max(300),
	shape: z.string().max(4000).default('')
});

export type ContractChange = z.infer<typeof ContractChangeSchema>;

export const ModuleChangeSchema = z.object({
	op: z.enum(['create', 'change']),
	path: z.string().trim().min(1).max(300),
	symbol: z.string().trim().min(1).max(120).optional()
});

export type ModuleChange = z.infer<typeof ModuleChangeSchema>;

// `item` is a footprint key — see `footprintKey` — naming a piece another plan
// creates or changes.
export const ConsumedPieceSchema = z.object({
	planNumber: z.number().int().positive(),
	item: z.string().trim().min(1).max(500)
});

export type ConsumedPiece = z.infer<typeof ConsumedPieceSchema>;

export const FootprintSchema = z.object({
	schema: z.array(SchemaChangeSchema).max(50).default([]),
	contracts: z.array(ContractChangeSchema).max(50).default([]),
	modules: z.array(ModuleChangeSchema).max(100).default([]),
	consumes: z.array(ConsumedPieceSchema).max(50).default([])
});

export type Footprint = z.infer<typeof FootprintSchema>;

export const EMPTY_FOOTPRINT: Footprint = { schema: [], contracts: [], modules: [], consumes: [] };

// One piece, whatever kind it is, reduced to the key two plans are compared on.
export type FootprintPiece =
	| { kind: 'schema'; key: string; creates: boolean; changes: boolean; definition: string; label: string }
	| { kind: 'contract'; key: string; creates: boolean; changes: boolean; definition: string; label: string }
	| { kind: 'module'; key: string; creates: boolean; changes: boolean; definition: string; label: string; symbol: boolean };

function unquote(value: string): string {
	return value.trim().replace(/^["'`]|["'`]$/g, '');
}

function normalizeIdentifier(value: string): string {
	return unquote(value).toLowerCase();
}

// `/users/:id`, `/users/{id}` and `/users/<id>` are the same route.
export function normalizeContractPath(path: string): string {
	const trimmed = path.trim().replace(/\/+$/, '') || '/';

	return trimmed
		.split('/')
		.map((segment) => (/^(:\w+|\{\w+\}|<\w+>)$/.test(segment) ? ':param' : segment))
		.join('/');
}

export function normalizeDefinition(definition: string): string {
	return definition
		.trim()
		.toLowerCase()
		.replace(/["'`]/g, '')
		.replace(/\s*([(),;:=])\s*/g, '$1')
		.replace(/\s+/g, ' ');
}

export function schemaKey(change: Pick<SchemaChange, 'table' | 'column'>): string {
	return change.column === undefined
		? `table:${normalizeIdentifier(change.table)}`
		: `column:${normalizeIdentifier(change.table)}.${normalizeIdentifier(change.column)}`;
}

export function contractKey(change: Pick<ContractChange, 'method' | 'path'>): string {
	return `contract:${change.method.trim().toUpperCase()} ${normalizeContractPath(change.path)}`;
}

export function moduleKey(change: Pick<ModuleChange, 'path' | 'symbol'>): string {
	const path = change.path.trim().replace(/^\.\//, '');

	return change.symbol === undefined ? `module:${path}` : `module:${path}#${change.symbol.trim()}`;
}

export function footprintPieces(footprint: Footprint): FootprintPiece[] {
	return [
		...footprint.schema.map((change) => ({
			kind: 'schema' as const,
			key: schemaKey(change),
			creates: change.op === 'create_table' || change.op === 'add_column',
			changes: change.op === 'alter_column' || change.op === 'drop',
			definition: normalizeDefinition(change.definition),
			label: change.column === undefined ? unquote(change.table) : `${unquote(change.table)}.${unquote(change.column)}`
		})),
		...footprint.contracts.map((change) => ({
			kind: 'contract' as const,
			key: contractKey(change),
			creates: change.op === 'create',
			changes: change.op === 'change',
			definition: normalizeDefinition(change.shape),
			label: `${change.method.toUpperCase()} ${change.path}`
		})),
		...footprint.modules.map((change) => ({
			kind: 'module' as const,
			key: moduleKey(change),
			creates: change.op === 'create',
			changes: change.op === 'change',
			definition: '',
			label: change.symbol === undefined ? change.path : `${change.symbol} in ${change.path}`,
			symbol: change.symbol !== undefined
		}))
	];
}

// A column belongs to its table: a plan adding a column to a table another plan
// creates is using that table.
export function parentKeys(key: string): string[] {
	const column = /^column:([^.]+)\./.exec(key);

	if (column) {
		return [`table:${column[1]}`];
	}

	const symbol = /^(module:[^#]+)#/.exec(key);

	return symbol ? [symbol[1]!] : [];
}

// The pieces another plan could consume: schema, contracts, and a created module.
// A later bullet may change modules; only the foundation may add these.
export function sharedPieces(footprint: Footprint): number {
	return (
		footprint.schema.length +
		footprint.contracts.length +
		footprint.modules.filter((change) => change.op === 'create').length
	);
}
