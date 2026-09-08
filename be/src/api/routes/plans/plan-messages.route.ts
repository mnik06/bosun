import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	PlanIdParamsSchema,
	SayToPlanReqSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { sayToPlan } from 'src/controllers/plans/say-to-plan';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/messages',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: SayToPlanReqSchema
			}
		},
		async (req, reply) => {
			await sayToPlan({
				planRepo: fastify.repos.planRepo,
				planMessageRepo: fastify.repos.planMessageRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				userId: req.user!.id,
				text: req.body.text
			});

			return reply.status(202).send(undefined);
		}
	);

};

export default routes;
