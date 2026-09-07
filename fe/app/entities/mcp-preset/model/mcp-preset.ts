import { z } from 'zod'

export const McpRequirementSchema = z.object({
	env: z.string(),
	label: z.string(),
	helpUrl: z.url().optional()
})

export type McpRequirement = z.infer<typeof McpRequirementSchema>

// `server` is deliberately not modelled here. What the browser needs is the name,
// the blurb and which credentials the machine will ask for — the definition
// itself is the agent's business and never renders.
export const McpPresetSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	docsUrl: z.url().optional(),
	requires: z.array(McpRequirementSchema)
})

export type McpPreset = z.infer<typeof McpPresetSchema>

export const McpPresetListSchema = z.array(McpPresetSchema)
