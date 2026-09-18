import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import { CreateQuickFixReqSchema } from 'src/api/routes/schemas/machines/MachineQuickFixReqSchemas';
import { lineDeps } from 'src/controllers/line/line-deps';
import { dispatchQuickFix } from 'src/controllers/quick-fixes/dispatch-quick-fix';
import { QuickFixSchema } from 'src/types/QuickFixSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/quick-fixes',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				body: CreateQuickFixReqSchema,
				response: { 201: QuickFixSchema }
			}
		},
		async (req, reply) => {
			const quickFix = await dispatchQuickFix(lineDeps(fastify), {
				projectId: req.membership!.projectId,
				createdByUserId: req.user!.id,
				machineId: req.params.id,
				description: req.body.description
			});

			return reply.status(201).send(quickFix);
		}
	);
};

export default routes;
