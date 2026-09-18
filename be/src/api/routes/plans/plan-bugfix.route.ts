import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BugfixMessageListRespSchema, PlanBugListRespSchema } from 'src/api/routes/schemas/plans/BugfixRespSchemas';
import { PlanIdParamsSchema, SayToPlanReqSchema } from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { lineDeps } from 'src/controllers/line/line-deps';
import { closeBugfixSession } from 'src/controllers/plans/bugfix/close-bugfix';
import { listBugfixMessages } from 'src/controllers/plans/bugfix/list-bugfix-messages';
import { listPlanBugs } from 'src/controllers/plans/bugfix/list-plan-bugs';
import { sayToBugfix } from 'src/controllers/plans/bugfix/say-to-bugfix';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/bugfix/messages',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: SayToPlanReqSchema
			}
		},
		async (req, reply) => {
			await sayToBugfix(lineDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				userId: req.user!.id,
				text: req.body.text
			});

			return reply.status(202).send(undefined);
		}
	);

	fastify.get(
		'/:id/bugfix/messages',
		{
			schema: {
				params: PlanIdParamsSchema,
				response: { 200: BugfixMessageListRespSchema }
			}
		},
		async (req) => {
			return listBugfixMessages(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId });
		}
	);

	fastify.get(
		'/:id/bugs',
		{
			schema: {
				params: PlanIdParamsSchema,
				response: { 200: PlanBugListRespSchema }
			}
		},
		async (req) => {
			return listPlanBugs(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId });
		}
	);

	fastify.post(
		'/:id/bugfix/close',
		{ schema: { params: PlanIdParamsSchema } },
		async (req, reply) => {
			await closeBugfixSession(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId });

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
