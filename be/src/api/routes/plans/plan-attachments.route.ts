import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PlanAttachmentParamsSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { getPlanAttachment } from 'src/controllers/plans/get-plan-attachment';
import { attachmentHeaders } from 'src/controllers/plans/shared/chat-attachments';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/:id/attachments/:attachmentId',
		{ schema: { params: PlanAttachmentParamsSchema } },
		async (req, reply) => {
			const file = await getPlanAttachment({
				planRepo: fastify.repos.planRepo,
				chatAttachmentRepo: fastify.repos.chatAttachmentRepo,
				id: req.params.id,
				attachmentId: req.params.attachmentId,
				projectId: req.membership!.projectId
			});

			return reply.headers(attachmentHeaders(file)).send(file.data);
		}
	);
};

export default routes;
