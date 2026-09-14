import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AskLineReqSchema, RepositoryMessagesRespSchema } from 'src/api/routes/schemas/line/LineSchemas';
import { RepositoryIdParamsSchema } from 'src/api/routes/schemas/repositories/RepositorySchemas';
import { askLine, listRepositoryMessages } from 'src/controllers/line/ask-line';
import { lineDeps } from 'src/controllers/line/line-deps';
import { RepositoryMessageSchema } from 'src/types/BuildSchema';

// The line's chat is a member's, like the line itself.
const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/:id/messages',
		{ schema: { params: RepositoryIdParamsSchema, response: { 200: RepositoryMessagesRespSchema } } },
		async (req) => listRepositoryMessages(lineDeps(fastify), { repositoryId: req.params.id, projectId: req.membership!.projectId })
	);

	fastify.post(
		'/:id/messages',
		{ schema: { params: RepositoryIdParamsSchema, body: AskLineReqSchema, response: { 201: RepositoryMessageSchema } } },
		async (req, reply) => {
			const message = await askLine(lineDeps(fastify), {
				repositoryId: req.params.id,
				projectId: req.membership!.projectId,
				question: req.body.question
			});

			return reply.status(201).send(message);
		}
	);
};

export default routes;
