import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AcParamsSchema, UpdateAcReqSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { deleteAc } from 'src/controllers/acs/delete-ac';
import { updateAc } from 'src/controllers/acs/update-ac';
import { AcSchema } from 'src/types/PlanSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();
	const artifactDeps = {
		planRepo: fastify.repos.planRepo,
		acRepo: fastify.repos.acRepo,
		sliceRepo: fastify.repos.sliceRepo,
		socketRegistry: fastify.services.socketRegistry
	};

	fastify.patch(
		'/:id/acs/:acId',
		{
			schema: {
				params: AcParamsSchema,
				body: UpdateAcReqSchema,
				response: { 200: AcSchema }
			}
		},
		async (req) => {
			return updateAc({
				...artifactDeps,
				planId: req.params.id,
				acId: req.params.acId,
				userId: req.user!.id,
				...req.body
			});
		}
	);

	fastify.delete('/:id/acs/:acId', { schema: { params: AcParamsSchema } }, async (req, reply) => {
		await deleteAc({
			...artifactDeps,
			planId: req.params.id,
			acId: req.params.acId,
			userId: req.user!.id
		});

		return reply.status(204).send(undefined);
	});
};

export default routes;
