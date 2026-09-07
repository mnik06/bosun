import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { HttpError } from 'src/api/errors/HttpError';
import {
	McpPresetListRespSchema,
	McpPresetRespSchema
} from 'src/api/routes/schemas/mcp/McpPresetRespSchemas';
import { McpPresetIdParamsSchema } from 'src/api/routes/schemas/mcp/McpPresetIdParamsSchema';

// Unauthenticated: a catalogue of publicly documented third-party servers is not
// user data, and the agent reads it before it has a reason to prove who it is.
// No credential appears here — a preset names the variable it needs, never a value.
const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/mcp-presets',
		{ schema: { response: { 200: McpPresetListRespSchema } } },
		async () => {
			return fastify.services.mcpPresets.list();
		}
	);

	fastify.get(
		'/mcp-presets/:id',
		{
			schema: {
				params: McpPresetIdParamsSchema,
				response: { 200: McpPresetRespSchema }
			}
		},
		async (req) => {
			const preset = fastify.services.mcpPresets.find(req.params.id);

			if (!preset) {
				throw new HttpError(404, 'Unknown MCP preset');
			}

			return preset;
		}
	);
};

export default routes;
