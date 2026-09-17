import { z } from 'zod';
import { McpPresetSchema } from 'src/types/McpPresetSchema';

// minAgentVersion is a gate the backend checks against the caller, never
// something either the browser or the agent has a use for — dropped from every
// response that serves this catalogue, list or single.
const PublicMcpPresetSchema = McpPresetSchema.omit({ minAgentVersion: true });

export const McpPresetListRespSchema = z.array(PublicMcpPresetSchema);

export const McpPresetRespSchema = PublicMcpPresetSchema;
