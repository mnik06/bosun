import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { EnrollReqSchema } from 'src/api/routes/schemas/enroll/EnrollReqSchema';
import { EnrollRespSchema } from 'src/api/routes/schemas/enroll/EnrollRespSchema';
import { enrollMachine } from 'src/controllers/enroll/enroll-machine';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/',
		{
			schema: {
				body: EnrollReqSchema,
				response: { 200: EnrollRespSchema }
			}
		},
		async (req) => {
			return enrollMachine({
				machineRepo: fastify.repos.machineRepo,
				token: req.body.token,
				repoPath: req.body.repoPath,
				serverUrl: process.env.PUBLIC_SERVER_URL!
			});
		}
	);
};

export default routes;
