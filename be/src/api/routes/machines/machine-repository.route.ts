import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import {
	AttachRepositoryReqSchema,
	AttachRepositoryRespSchema,
	SaveMachinePolicyReqSchema
} from 'src/api/routes/schemas/machines/MachineRepositoryReqSchemas';
import { attachAzureRepository } from 'src/controllers/machines/attach-azure-repository';
import { attachGithubRepository } from 'src/controllers/machines/attach-repository';
import { saveMachinePolicy } from 'src/controllers/machines/save-machine-policy';
import { onboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { MachineSchema } from 'src/types/MachineSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post(
		'/:id/repository',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				body: AttachRepositoryReqSchema,
				response: { 202: AttachRepositoryRespSchema }
			}
		},
		async (req, reply) => {
			if (req.body.provider === 'github') {
				await attachGithubRepository({
					machineRepo: fastify.repos.machineRepo,
					repositoryRepo: fastify.repos.repositoryRepo,
					githubInstallationRepo: fastify.repos.githubInstallationRepo,
					buildRepo: fastify.repos.buildRepo,
					githubApp: fastify.services.githubApp,
					idService: fastify.services.idService,
					socketRegistry: fastify.services.socketRegistry,
					id: req.params.id,
					projectId: req.membership!.projectId,
					githubRepoId: req.body.githubRepoId
				});
			} else {
				await attachAzureRepository({
					machineRepo: fastify.repos.machineRepo,
					repositoryRepo: fastify.repos.repositoryRepo,
					azureConnectionRepo: fastify.repos.azureConnectionRepo,
					buildRepo: fastify.repos.buildRepo,
					azureDevOps: fastify.services.azureDevOps,
					patEncryption: fastify.services.patEncryption,
					idService: fastify.services.idService,
					socketRegistry: fastify.services.socketRegistry,
					id: req.params.id,
					projectId: req.membership!.projectId,
					azureConnectionId: req.body.azureConnectionId,
					azureProjectId: req.body.azureProjectId,
					azureRepoId: req.body.azureRepoId
				});
			}

			return reply.status(202).send({ status: 'requested' as const });
		}
	);

	fastify.put(
		'/:id/policy',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MachineIdParamsSchema,
				body: SaveMachinePolicyReqSchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return saveMachinePolicy(onboardingDeps(fastify), {
				id: req.params.id,
				projectId: req.membership!.projectId,
				applyMigrations: req.body.applyMigrations
			});
		}
	);
};

export default routes;
