import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	BuildDependencyParamsSchema,
	BuildIdParamsSchema,
	ShipFoundationRespSchema
} from 'src/api/routes/schemas/line/LineSchemas';
import { controlBuild, type BuildAction } from 'src/controllers/line/control-build';
import { lineDeps } from 'src/controllers/line/line-deps';
import { overrideDependency } from 'src/controllers/line/override-dependency';
import { acceptGaps, fixAgain } from 'src/controllers/line/recheck-choice';
import { shipFoundation } from 'src/controllers/line/ship-foundation';
import { BuildSchema } from 'src/types/BuildSchema';

const ACTIONS: BuildAction[] = ['hold', 'release', 'cancel', 'front', 'retry'];

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	for (const action of ACTIONS) {
		fastify.post(
			`/:id/${action}`,
			{ schema: { params: BuildIdParamsSchema, response: { 200: BuildSchema } } },
			async (req) => controlBuild(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId, action })
		);
	}

	fastify.post(
		'/:id/fix-again',
		{ schema: { params: BuildIdParamsSchema, response: { 200: BuildSchema } } },
		async (req) => fixAgain(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId })
	);

	fastify.post(
		'/:id/accept-gaps',
		{ schema: { params: BuildIdParamsSchema, response: { 200: BuildSchema } } },
		async (req) => acceptGaps(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId, userId: req.user!.id })
	);

	fastify.post(
		'/:id/dependencies/:dependencyId/override',
		{ schema: { params: BuildDependencyParamsSchema } },
		async (req, reply) => {
			await overrideDependency(lineDeps(fastify), {
				buildId: req.params.id,
				dependencyId: req.params.dependencyId,
				projectId: req.membership!.projectId,
				userId: req.user!.id
			});

			return reply.status(204).send(undefined);
		}
	);

	fastify.post(
		'/:id/ship-foundation',
		{ schema: { params: BuildIdParamsSchema, response: { 200: ShipFoundationRespSchema } } },
		async (req) => shipFoundation(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId })
	);
};

export default routes;
