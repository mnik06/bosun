import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { UiTicketRespSchema } from 'src/api/routes/schemas/ui/UiTicketRespSchema';
import { issueTicket } from 'src/services/tickets/ticket.service';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.addHook('preValidation', fastify.requireUser);

	fastify.post(
		'/ticket',
		{
			schema: {
				response: { 200: UiTicketRespSchema }
			}
		},
		async (req) => {
			return issueTicket(req.user!.id);
		}
	);
};

export default routes;
