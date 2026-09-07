import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	CreateSliceReqSchema,
	PlanIdParamsSchema,
	SliceParamsSchema,
	UpdateSliceReqSchema
} from 'src/api/routes/schemas/plans/PlanReqSchemas';
import { createSlice } from 'src/controllers/slices/create-slice';
import { deleteSlice } from 'src/controllers/slices/delete-slice';
import { updateSlice } from 'src/controllers/slices/update-slice';
import { SliceSchema } from 'src/types/PlanSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();
	const artifactRepos = {
		planRepo: fastify.repos.planRepo,
		acRepo: fastify.repos.acRepo,
		sliceRepo: fastify.repos.sliceRepo
	};

	fastify.post(
		'/:id/slices',
		{
			schema: {
				params: PlanIdParamsSchema,
				body: CreateSliceReqSchema,
				response: { 201: SliceSchema }
			}
		},
		async (req, reply) => {
			const slice = await createSlice({
				...artifactRepos,
				planId: req.params.id,
				userId: req.user!.id,
				...req.body
			});

			return reply.status(201).send(slice);
		}
	);

	fastify.patch(
		'/:id/slices/:sliceId',
		{
			schema: {
				params: SliceParamsSchema,
				body: UpdateSliceReqSchema,
				response: { 200: SliceSchema }
			}
		},
		async (req) => {
			return updateSlice({
				...artifactRepos,
				planId: req.params.id,
				sliceId: req.params.sliceId,
				userId: req.user!.id,
				...req.body
			});
		}
	);

	fastify.delete(
		'/:id/slices/:sliceId',
		{ schema: { params: SliceParamsSchema } },
		async (req, reply) => {
			await deleteSlice({
				...artifactRepos,
				planId: req.params.id,
				sliceId: req.params.sliceId,
				userId: req.user!.id
			});

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
