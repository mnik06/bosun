import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DecideOverlapReqSchema, OverlapDecisionParamsSchema } from 'src/api/routes/schemas/line/LineSchemas';
import { decideOverlap } from 'src/controllers/line/decide-overlap';
import { lineDeps } from 'src/controllers/line/line-deps';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id',
		{ schema: { params: OverlapDecisionParamsSchema, body: DecideOverlapReqSchema } },
		async (req, reply) => {
			await decideOverlap(lineDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				userId: req.user!.id,
				chosen: req.body.chosen
			});

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
