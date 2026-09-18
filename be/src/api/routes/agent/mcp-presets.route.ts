import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { McpPresetRespSchema } from 'src/api/routes/schemas/mcp/McpPresetRespSchemas';
import { McpPresetIdParamsSchema } from 'src/api/routes/schemas/mcp/McpPresetIdParamsSchema';
import { getMcpPresetForAgent } from 'src/controllers/agent/get-mcp-preset';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/mcp-presets/:id',
		{
			schema: {
				params: McpPresetIdParamsSchema,
				response: { 200: McpPresetRespSchema }
			}
		},
		async (req) => {
			return getMcpPresetForAgent({
				machineRepo: fastify.repos.machineRepo,
				mcpPresets: fastify.services.mcpPresets,
				machineId: req.agent!.machineId,
				id: req.params.id
			});
		}
	);
};

export default routes;
