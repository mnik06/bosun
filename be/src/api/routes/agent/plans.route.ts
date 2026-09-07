import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AgentAcReqSchema,
	AgentPlanTitleReqSchema,
	AgentSliceReqSchema,
	PlanIdParamsSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import {
	AgentAcRespSchema,
	AgentPlanTitleRespSchema,
	AgentSliceRespSchema
} from 'src/api/routes/schemas/plans/PlanRespSchemas';
import { addPlanAc } from 'src/controllers/plans/agent/add-plan-ac';
import { createPlanSlice } from 'src/controllers/plans/agent/create-plan-slice';
import { savePlanTitle } from 'src/controllers/plans/agent/save-plan-title';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/plans/:id/title',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AgentPlanTitleReqSchema,
				response: { 200: AgentPlanTitleRespSchema }
			}
		},
		async (req) => {
			const plan = await savePlanTitle({
				planRepo: fastify.repos.planRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				machineId: req.agent!.machineId,
				title: req.body.title,
				bodyMd: req.body.bodyMd
			});

			return { planId: plan.id };
		}
	);

	fastify.post(
		'/plans/:id/acs',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AgentAcReqSchema,
				response: { 201: AgentAcRespSchema }
			}
		},
		async (req, reply) => {
			const ac = await addPlanAc({
				planRepo: fastify.repos.planRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				machineId: req.agent!.machineId,
				code: req.body.code,
				text: req.body.text
			});

			return reply.status(201).send({ acId: ac.id, code: ac.code });
		}
	);

	fastify.post(
		'/plans/:id/slices',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: AgentSliceReqSchema,
				response: { 201: AgentSliceRespSchema }
			}
		},
		async (req, reply) => {
			const slice = await createPlanSlice({
				db: fastify.db,
				planRepo: fastify.repos.planRepo,
				acRepo: fastify.repos.acRepo,
				sliceRepo: fastify.repos.sliceRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				machineId: req.agent!.machineId,
				...req.body
			});

			return reply.status(201).send({ sliceId: slice.id });
		}
	);
};

export default routes;
