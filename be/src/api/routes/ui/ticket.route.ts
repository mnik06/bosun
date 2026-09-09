import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UiTicketRespSchema } from 'src/api/routes/schemas/ui/UiTicketRespSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.addHook('preValidation', fastify.requireUser);
	fastify.addHook('preValidation', fastify.requireMembership);

	fastify.post(
		'/ticket',
		{
			schema: {
				response: { 200: UiTicketRespSchema }
			}
		},
		async (req) => {
			return fastify.services.ticketService.issue({
				userId: req.user!.id,
				projectId: req.membership!.projectId
			});
		}
	);
};

export default routes;
