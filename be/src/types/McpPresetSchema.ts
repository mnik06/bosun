import { z } from 'zod';

export const McpRequirementSchema = z.object({
	// The variable the agent writes into ~/.bosun/env and the server config
	// references as ${VAR}. The value never travels through bosun.
	env: z.string().min(1),
	label: z.string().min(1),
	helpUrl: z.url().optional(),
	// Echoed at the prompt rather than hidden. An account name or a site URL is
	// not a credential, and masking it only makes it harder to check for a typo.
	secret: z.boolean().optional()
});

export type McpRequirement = z.infer<typeof McpRequirementSchema>;

const HttpServerSchema = z.object({
	type: z.literal('http'),
	url: z.string().min(1),
	headers: z.record(z.string(), z.string()).optional()
});

// A stdio server runs a command on the user's machine. That is a real escalation
// over an HTTP endpoint, which is why `mcp add` prints the resolved config and
// requires a yes before writing it rather than treating a preset as trusted
// because it came from us.
const StdioServerSchema = z.object({
	type: z.literal('stdio'),
	command: z.string().min(1),
	args: z.array(z.string()).optional(),
	env: z.record(z.string(), z.string()).optional()
});

export const McpServerDefSchema = z.discriminatedUnion('type', [
	HttpServerSchema,
	StdioServerSchema
]);

export type McpServerDef = z.infer<typeof McpServerDefSchema>;

// HTTP Basic is common enough among third-party servers to name, and it is the
// one shape `${VAR}` substitution cannot express: the header carries
// base64(user:secret), and no amount of variable expansion will encode it. The
// agent combines the two prompted values and writes the encoded result as `into`.
export const McpBasicAuthSchema = z.object({
	user: z.string().min(1),
	secret: z.string().min(1),
	into: z.string().min(1)
});

export type McpBasicAuth = z.infer<typeof McpBasicAuthSchema>;

export const McpPresetSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().min(1),
	docsUrl: z.url().optional(),
	requires: z.array(McpRequirementSchema),
	basicAuth: McpBasicAuthSchema.optional(),
	server: McpServerDefSchema
});

export type McpPreset = z.infer<typeof McpPresetSchema>;

export const McpPresetListSchema = z.array(McpPresetSchema);
