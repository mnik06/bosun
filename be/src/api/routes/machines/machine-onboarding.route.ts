import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import {
	MachineOnboardingRespSchema,
	OnboardingRunRespSchema,
	StartOnboardingReqSchema
} from 'src/api/routes/schemas/machines/MachineRepositoryReqSchemas';
import { getMachineOnboarding } from 'src/controllers/onboarding/get-machine-onboarding';
import { onboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { startOnboarding } from 'src/controllers/onboarding/start-onboarding';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/onboarding',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				body: StartOnboardingReqSchema,
				response: { 200: OnboardingRunRespSchema }
			}
		},
		async (req) => {
			const run = await startOnboarding(onboardingDeps(fastify), {
				machineId: req.params.id,
				projectId: req.membership!.projectId,
				phase: req.body.phase
			});

			return { run };
		}
	);

	fastify.get(
		'/:id/onboarding',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				response: { 200: MachineOnboardingRespSchema }
			}
		},
		async (req) => {
			return getMachineOnboarding({
				machineRepo: fastify.repos.machineRepo,
				onboardingRunRepo: fastify.repos.onboardingRunRepo,
				machineId: req.params.id,
				projectId: req.membership!.projectId
			});
		}
	);
};

export default routes;
