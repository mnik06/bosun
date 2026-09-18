import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { McpPresetListRespSchema } from 'src/api/routes/schemas/mcp/McpPresetRespSchemas';

// Unauthenticated: the catalogue of publicly documented third-party servers is
// not user data, and the agent reads it before it has a reason to prove who it
// is. No credential appears here — a preset names the variable it needs, never a
// value. Fetching one preset by id is authenticated, at GET /agent/mcp-presets/:id
// — some presets gate on the calling machine's agent version, which this list
// does not need to know.
const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/mcp-presets',
		{ schema: { response: { 200: McpPresetListRespSchema } } },
		async () => {
			return fastify.services.mcpPresets.list();
		}
	);
};

export default routes;
