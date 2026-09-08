import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	CreatePlanReqSchema,
	PlanIdParamsSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import {
	PlanDetailRespSchema,
	PlanListRespSchema
} from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { discardPlan } from 'src/controllers/plans/discard-plan';
import { getPlanDetail } from 'src/controllers/plans/get-plan-detail';
import { listPlans } from 'src/controllers/plans/list-plans';
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
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				userId: req.user!.id,
				machineId: req.body.machineId,
				input: req.body.input,
				verifyInUi: req.body.verifyInUi
			});

			return reply.status(201).send(plan);
		}
	);

	fastify.get('/', { schema: { response: { 200: PlanListRespSchema } } }, async (req) => {
		return listPlans({ planRepo: fastify.repos.planRepo, userId: req.user!.id });
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
			return getPlanDetail({
				planRepo: fastify.repos.planRepo,
				planMessageRepo: fastify.repos.planMessageRepo,
				planBlockerRepo: fastify.repos.planBlockerRepo,
				planDecisionRepo: fastify.repos.planDecisionRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				id: req.params.id,
				userId: req.user!.id
			});
		}
	);

	fastify.delete('/:id', { schema: { params: PlanIdParamsSchema } }, async (req, reply) => {
		await discardPlan({
			planRepo: fastify.repos.planRepo,
			planTextService: fastify.services.planTextService,
			socketRegistry: fastify.services.socketRegistry,
			id: req.params.id,
			userId: req.user!.id
		});

		return reply.status(204).send(undefined);
	});
};

export default routes;
