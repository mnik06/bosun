import { z } from 'zod'

export const SchemaChangeSchema = z.object({
	op: z.enum(['create_table', 'add_column', 'alter_column', 'drop']),
	table: z.string(),
	column: z.string().optional(),
	definition: z.string()
})

export const ContractChangeSchema = z.object({
	op: z.enum(['create', 'change']),
	method: z.string(),
	path: z.string(),
	shape: z.string()
})

export const ModuleChangeSchema = z.object({
	op: z.enum(['create', 'change']),
	path: z.string(),
	symbol: z.string().optional()
})

export const ConsumedPieceSchema = z.object({
	planNumber: z.number().int(),
	item: z.string()
})

export const FootprintSchema = z.object({
	schema: z.array(SchemaChangeSchema),
	contracts: z.array(ContractChangeSchema),
	modules: z.array(ModuleChangeSchema),
	consumes: z.array(ConsumedPieceSchema)
})

export type Footprint = z.infer<typeof FootprintSchema>
