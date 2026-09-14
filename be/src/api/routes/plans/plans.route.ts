import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	CreatePlanReqSchema,
	PlanIdParamsSchema,
	UpdatePlanReqSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import {
	PlanDetailRespSchema,
	PlanListRespSchema
} from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { lineDeps } from 'src/controllers/line/line-deps';
import { discardPlan } from 'src/controllers/plans/discard-plan';
import { getPlanDetail } from 'src/controllers/plans/get-plan-detail';
import { listPlans } from 'src/controllers/plans/list-plans';
import { setPlanAfk } from 'src/controllers/plans/set-plan-afk';
import { startPlan } from 'src/controllers/plans/start-plan';
import { PlanSchema } from 'src/types/PlanSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/',
		{
			schema: {
				body: CreatePlanReqSchema,
				response: { 201: PlanSchema }
			}
		},
		async (req, reply) => {
			const plan = await startPlan({
				planRepo: fastify.repos.planRepo,
				planMessageRepo: fastify.repos.planMessageRepo,
				machineRepo: fastify.repos.machineRepo,
				repositoryRepo: fastify.repos.repositoryRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				projectId: req.membership!.projectId,
				createdByUserId: req.user!.id,
				machineId: req.body.machineId,
				input: req.body.input,
				verifyInUi: req.body.verifyInUi,
				auto: req.body.auto,
				afk: req.body.afk
			});

			return reply.status(201).send(plan);
		}
	);

	fastify.get('/', { schema: { response: { 200: PlanListRespSchema } } }, async (req) => {
		return listPlans(lineDeps(fastify), { projectId: req.membership!.projectId });
	});

	fastify.get(
		'/:id',
		{
			schema: {
				params: PlanIdParamsSchema,
				response: { 200: PlanDetailRespSchema }
			}
		},
		async (req) => {
			return getPlanDetail(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId });
		}
	);

	fastify.patch(
		'/:id',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: UpdatePlanReqSchema,
				response: { 200: PlanSchema }
			}
		},
		async (req) => {
			return setPlanAfk(lineDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				afk: req.body.afk
			});
		}
	);

	fastify.delete('/:id', { schema: { params: PlanIdParamsSchema } }, async (req, reply) => {
		await discardPlan(lineDeps(fastify), { id: req.params.id, projectId: req.membership!.projectId });

		return reply.status(204).send(undefined);
	});
};

export default routes;
