import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateMachineReqSchema } from 'src/api/routes/schemas/machines/CreateMachineReqSchema';
import { CreateMachineRespSchema } from 'src/api/routes/schemas/machines/CreateMachineRespSchema';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import { MachineListRespSchema } from 'src/api/routes/schemas/machines/MachineListRespSchema';
import { PingMachineRespSchema } from 'src/api/routes/schemas/machines/PingMachineRespSchema';
import { createMachine } from 'src/controllers/machines/create-machine';
import { getMachine } from 'src/controllers/machines/get-machine';
import { listMachines } from 'src/controllers/machines/list-machines';
import { pingMachine } from 'src/controllers/machines/ping-machine';
import { MachineSchema } from 'src/types/MachineSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/',
		{
			schema: {
				body: CreateMachineReqSchema,
				response: { 201: CreateMachineRespSchema }
			}
		},
		async (req, reply) => {
			const created = await createMachine({
				machineRepo: fastify.repos.machineRepo,
				name: req.body.name,
				serverUrl: process.env.PUBLIC_SERVER_URL!
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
		async () => {
			return listMachines({ machineRepo: fastify.repos.machineRepo });
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
			return getMachine({ machineRepo: fastify.repos.machineRepo, id: req.params.id });
		}
	);

	fastify.post(
		'/:id/ping',
		{
			schema: {
				params: MachineIdParamsSchema,
				response: { 202: PingMachineRespSchema }
			}
		},
		async (req, reply) => {
			await getMachine({ machineRepo: fastify.repos.machineRepo, id: req.params.id });

			return reply.status(202).send(pingMachine({ id: req.params.id }));
		}
	);
};

export default routes;
