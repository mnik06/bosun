import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NeedsYouRespSchema } from 'src/api/routes/schemas/line/LineSchemas';
import { getNeedsYou } from 'src/controllers/line/get-needs-you';
import { lineDeps } from 'src/controllers/line/line-deps';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/',
		{ schema: { response: { 200: NeedsYouRespSchema } } },
		async (req) => getNeedsYou(lineDeps(fastify), { projectId: req.membership!.projectId })
	);
};

export default routes;
