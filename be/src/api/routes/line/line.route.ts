import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	LineOrderReqSchema,
	LineQuerySchema,
	LineRespSchema
} from 'src/api/routes/schemas/line/LineSchemas';
import { getLine } from 'src/controllers/line/get-line';
import { lineDeps } from 'src/controllers/line/line-deps';
import { reorderLine } from 'src/controllers/line/reorder-line';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/',
		{ schema: { querystring: LineQuerySchema, response: { 200: LineRespSchema } } },
		async (req) => getLine(lineDeps(fastify), { projectId: req.membership!.projectId, repositoryId: req.query.repositoryId })
	);

	fastify.put('/order', { schema: { body: LineOrderReqSchema } }, async (req, reply) => {
		await reorderLine(lineDeps(fastify), { projectId: req.membership!.projectId, ...req.body });

		return reply.status(204).send(undefined);
	});
};

export default routes;
