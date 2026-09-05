import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { HealthRespSchema } from 'src/api/routes/schemas/health/HealthRespSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/',
		{
			schema: {
				response: {
					200: HealthRespSchema
				}
			}
		},
		async () => {
			return { status: 'ok' as const };
		}
	);
};

export default routes;
