import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DeleteEnvSetQuerySchema } from 'src/api/routes/schemas/machines/DeleteEnvSetQuerySchema';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import { SaveEnvSetReqSchema } from 'src/api/routes/schemas/machines/SaveEnvSetReqSchema';
import { SaveSessionSecretsReqSchema } from 'src/api/routes/schemas/machines/MachineRepositoryReqSchemas';
import { deleteEnvSet } from 'src/controllers/machines/delete-env-set';
import { saveEnvSet } from 'src/controllers/machines/save-env-set';
import { saveSessionSecrets } from 'src/controllers/machines/save-session-secrets';
import { envRelayDeps } from 'src/controllers/machines/shared/env-relay-deps';
import { onboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { maybeStartVerify } from 'src/controllers/onboarding/shared/start-verify';
import { MachineSchema } from 'src/types/MachineSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();
	const startVerifyWhenSatisfied = async (machine: { id: string }) =>
		maybeStartVerify(onboardingDeps(fastify), { machineId: machine.id });

	fastify.put(
		'/:id/env-sets',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				body: SaveEnvSetReqSchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return saveEnvSet(envRelayDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				path: req.body.path,
				vars: req.body.vars,
				onSaved: startVerifyWhenSatisfied
			});
		}
	);

	fastify.delete(
		'/:id/env-sets',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				querystring: DeleteEnvSetQuerySchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return deleteEnvSet(envRelayDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				path: req.query.path
			});
		}
	);

	fastify.put(
		'/:id/session-secrets',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				body: SaveSessionSecretsReqSchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return saveSessionSecrets(envRelayDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				vars: req.body.vars,
				onSaved: startVerifyWhenSatisfied
			});
		}
	);
};

export default routes;
