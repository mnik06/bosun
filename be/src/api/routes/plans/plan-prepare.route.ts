import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PreparePlansReqSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { preparePlans } from 'src/controllers/plans/prepare-plans';
import { PlanSchema } from 'src/types/PlanSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/prepare',
		{ schema: { body: PreparePlansReqSchema, response: { 201: PlanSchema } } },
		async (req, reply) => {
			const plan = await preparePlans({
				planRepo: fastify.repos.planRepo,
				planMessageRepo: fastify.repos.planMessageRepo,
				planBlockerRepo: fastify.repos.planBlockerRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				machineRepo: fastify.repos.machineRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				projectId: req.membership!.projectId,
				createdByUserId: req.user!.id,
				planIds: req.body.planIds
			});

			return reply.status(201).send(plan);
		}
	);
};

export default routes;
