import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentAttachmentIdParamsSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { getChatAttachmentForAgent } from 'src/controllers/agent/get-chat-attachment';
import { attachmentHeaders } from 'src/controllers/plans/shared/chat-attachments';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/attachments/:id',
		{ schema: { params: AgentAttachmentIdParamsSchema } },
		async (req, reply) => {
			const file = await getChatAttachmentForAgent({
				chatAttachmentRepo: fastify.repos.chatAttachmentRepo,
				id: req.params.id,
				projectId: req.agent!.projectId
			});

			return reply.headers(attachmentHeaders(file)).send(file.data);
		}
	);
};

export default routes;
