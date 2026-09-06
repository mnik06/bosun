import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MeRespSchema } from 'src/api/routes/schemas/me/MeRespSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.addHook('preValidation', fastify.requireUser);

	fastify.get(
		'/',
		{
			schema: {
				response: { 200: MeRespSchema }
			}
		},
		async (req) => {
			return req.user!;
		}
	);
};

export default routes;
