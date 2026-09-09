import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateMachineReqSchema } from 'src/api/routes/schemas/machines/CreateMachineReqSchema';
import { CreateMachineRespSchema } from 'src/api/routes/schemas/machines/CreateMachineRespSchema';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import { MachineListRespSchema } from 'src/api/routes/schemas/machines/MachineListRespSchema';
import { createMachine } from 'src/controllers/machines/create-machine';
import { deleteMachine } from 'src/controllers/machines/delete-machine';
import { getMachine } from 'src/controllers/machines/get-machine';
import { listMachines } from 'src/controllers/machines/list-machines';
import { MachineSchema } from 'src/types/MachineSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/',
		{
			preValidation: fastify.requireLeader,
			schema: {
				body: CreateMachineReqSchema,
				response: { 201: CreateMachineRespSchema }
			}
		},
		async (req, reply) => {
			const created = await createMachine({
				machineRepo: fastify.repos.machineRepo,
				idService: fastify.services.idService,
				keyService: fastify.services.keyService,
				projectId: req.membership!.projectId,
				name: req.body.name,
				serverUrl: fastify.env.PUBLIC_SERVER_URL
			});

			return reply.status(201).send(created);
		}
	);

	fastify.get(
		'/',
		{
			schema: {
				response: { 200: MachineListRespSchema }
			}
		},
		async (req) => {
			return listMachines({
				machineRepo: fastify.repos.machineRepo,
				projectId: req.membership!.projectId
			});
		}
	);

	fastify.get(
		'/:id',
		{
			schema: {
				params: MachineIdParamsSchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return getMachine({
				machineRepo: fastify.repos.machineRepo,
				id: req.params.id,
				projectId: req.membership!.projectId
			});
		}
	);

	fastify.delete(
		'/:id',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema
			}
		},
		async (req, reply) => {
			await deleteMachine({
				machineRepo: fastify.repos.machineRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				projectId: req.membership!.projectId
			});

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
