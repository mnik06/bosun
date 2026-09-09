import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	PlanIdParamsSchema,
	SayToPlanReqSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { PlanSchema } from 'src/types/PlanSchema';
import { confirmPlan } from 'src/controllers/plans/confirm-plan';
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
				machineRepo: fastify.repos.machineRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				projectId: req.membership!.projectId,
				text: req.body.text
			});

			return reply.status(202).send(undefined);
		}
	);

	fastify.post(
		'/:id/confirm',
		{
			schema: {
				params: PlanIdParamsSchema,
				response: { 200: PlanSchema }
			}
		},
		async (req) => {
			return confirmPlan({
				planRepo: fastify.repos.planRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				projectId: req.membership!.projectId
			});
		}
	);
};

export default routes;
