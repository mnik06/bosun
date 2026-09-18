import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	CHAT_MESSAGE_BODY_LIMIT,
	PlanIdParamsSchema,
	SayToPlanReqSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { ApprovePlanRespSchema } from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { approvePlan } from 'src/controllers/line/approve-plan';
import { lineDeps } from 'src/controllers/line/line-deps';
import { sayToPlan } from 'src/controllers/plans/say-to-plan';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/messages',
		{
			bodyLimit: CHAT_MESSAGE_BODY_LIMIT,
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
				chatAttachmentRepo: fastify.repos.chatAttachmentRepo,
				sliceRepo: fastify.repos.sliceRepo,
				machineRepo: fastify.repos.machineRepo,
				repositoryRepo: fastify.repos.repositoryRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				projectId: req.membership!.projectId,
				text: req.body.text,
				attachments: req.body.attachments
			});

			return reply.status(202).send(undefined);
		}
	);

	fastify.post(
		'/:id/approve',
		{
			schema: {
				params: PlanIdParamsSchema,
				response: { 200: ApprovePlanRespSchema }
			}
		},
		async (req) => {
			return approvePlan(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId });
		}
	);
};

export default routes;
