import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import { PingMachineRespSchema } from 'src/api/routes/schemas/machines/PingMachineRespSchema';
import { RefreshMachineRespSchema } from 'src/api/routes/schemas/machines/RefreshMachineRespSchema';
import { getMachine } from 'src/controllers/machines/get-machine';
import { pingMachine } from 'src/controllers/machines/ping-machine';
import { refreshMachine } from 'src/controllers/machines/refresh-machine';
import { setMachinePaused } from 'src/controllers/machines/set-machine-paused';
import { MachineSchema } from 'src/types/MachineSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	// Open to developers: a liveness read, and somebody who cannot tell whether a
	// machine is reachable cannot decide whether to queue work on it.
	fastify.post(
		'/:id/ping',
		{
			schema: {
				params: MachineIdParamsSchema,
				response: { 202: PingMachineRespSchema }
			}
		},
		async (req, reply) => {
			const machine = await getMachine({
				machineRepo: fastify.repos.machineRepo,
				id: req.params.id,
				projectId: req.membership!.projectId
			});

			return reply.status(202).send(
				pingMachine({
					idService: fastify.services.idService,
					pendingPings: fastify.services.pendingPings,
					socketRegistry: fastify.services.socketRegistry,
					machine
				})
			);
		}
	);

	fastify.post(
		'/:id/refresh',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				response: { 202: RefreshMachineRespSchema }
			}
		},
		async (req, reply) => {
			const machine = await getMachine({
				machineRepo: fastify.repos.machineRepo,
				id: req.params.id,
				projectId: req.membership!.projectId
			});

			refreshMachine({ socketRegistry: fastify.services.socketRegistry, machine });

			return reply.status(202).send({ status: 'requested' as const });
		}
	);

	for (const [path, paused] of [
		['/:id/pause', true],
		['/:id/resume', false]
	] as const) {
		fastify.post(
			path,
			{
				preValidation: fastify.requireLeader,
				schema: {
					params: MachineIdParamsSchema,
					response: { 200: MachineSchema }
				}
			},
			async (req) => {
				return setMachinePaused({
					machineRepo: fastify.repos.machineRepo,
					socketRegistry: fastify.services.socketRegistry,
					id: req.params.id,
					projectId: req.membership!.projectId,
					paused
				});
			}
		);
	}
};

export default routes;
