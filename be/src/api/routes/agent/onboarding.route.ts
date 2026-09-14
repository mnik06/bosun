import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	OkRespSchema,
	OnboardingAssumptionReqSchema,
	OnboardingConfigReqSchema,
	OnboardingConfigRespSchema,
	OnboardingRequirementReqSchema,
	OnboardingStepReqSchema,
	RunIdParamsSchema
} from 'src/api/routes/schemas/agent/AgentOnboardingSchemas';
import { recordOnboardingAssumption } from 'src/controllers/onboarding/agent/record-onboarding-assumption';
import { recordOnboardingRequirement } from 'src/controllers/onboarding/agent/record-onboarding-requirement';
import { recordOnboardingStep } from 'src/controllers/onboarding/agent/record-onboarding-step';
import { saveOnboardingConfig } from 'src/controllers/onboarding/agent/save-onboarding-config';
import { onboardingDeps } from 'src/controllers/onboarding/onboarding-deps';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/onboarding/:runId/steps',
		{ schema: { params: RunIdParamsSchema, body: OnboardingStepReqSchema, response: { 200: OkRespSchema } } },
		async (req) => {
			await recordOnboardingStep(onboardingDeps(fastify), {
				runId: req.params.runId,
				machineId: req.agent!.machineId,
				projectId: req.agent!.projectId,
				...req.body
			});

			return { ok: true as const };
		}
	);

	fastify.post(
		'/onboarding/:runId/config',
		{ schema: { params: RunIdParamsSchema, body: OnboardingConfigReqSchema, response: { 200: OnboardingConfigRespSchema } } },
		async (req) => {
			return saveOnboardingConfig(onboardingDeps(fastify), {
				runId: req.params.runId,
				machineId: req.agent!.machineId,
				projectId: req.agent!.projectId,
				yaml: req.body.yaml
			});
		}
	);

	fastify.post(
		'/onboarding/:runId/requirements',
		{ schema: { params: RunIdParamsSchema, body: OnboardingRequirementReqSchema, response: { 200: OkRespSchema } } },
		async (req) => {
			await recordOnboardingRequirement(onboardingDeps(fastify), {
				runId: req.params.runId,
				machineId: req.agent!.machineId,
				projectId: req.agent!.projectId,
				requirement: req.body
			});

			return { ok: true as const };
		}
	);

	fastify.post(
		'/onboarding/:runId/assumptions',
		{ schema: { params: RunIdParamsSchema, body: OnboardingAssumptionReqSchema, response: { 200: OkRespSchema } } },
		async (req) => {
			await recordOnboardingAssumption(onboardingDeps(fastify), {
				runId: req.params.runId,
				machineId: req.agent!.machineId,
				projectId: req.agent!.projectId,
				assumption: req.body
			});

			return { ok: true as const };
		}
	);
};

export default routes;
