import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AddRepositoryReqSchema,
	PullRequestRespSchema,
	RepositoryIdParamsSchema,
	RepositoryListRespSchema,
	RepositoryOnboardingRespSchema,
	RepositoryRespSchema,
	SaveConfigDraftReqSchema
} from 'src/api/routes/schemas/repositories/RepositorySchemas';
import { addRepository } from 'src/controllers/repositories/add-repository';
import { getRepositoryOnboarding } from 'src/controllers/repositories/get-repository-onboarding';
import { listRepositories } from 'src/controllers/repositories/list-repositories';
import { openConfigPullRequest } from 'src/controllers/repositories/open-config-pull-request';
import { saveConfigDraft } from 'src/controllers/repositories/save-config-draft';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get('/', { schema: { response: { 200: RepositoryListRespSchema } } }, async (req) => {
		return listRepositories({ repositoryRepo: fastify.repos.repositoryRepo, projectId: req.membership!.projectId });
	});

	fastify.post(
		'/',
		{
			preValidation: fastify.requireLeader,
			schema: { body: AddRepositoryReqSchema, response: { 200: RepositoryRespSchema } }
		},
		async (req) => {
			const repository = await addRepository({
				githubApp: fastify.services.githubApp,
				githubInstallationRepo: fastify.repos.githubInstallationRepo,
				repositoryRepo: fastify.repos.repositoryRepo,
				idService: fastify.services.idService,
				socketRegistry: fastify.services.socketRegistry,
				projectId: req.membership!.projectId,
				githubRepoId: req.body.githubRepoId
			});

			return { repository };
		}
	);

	fastify.put(
		'/:id/config-draft',
		{
			preValidation: fastify.requireLeader,
			schema: { params: RepositoryIdParamsSchema, body: SaveConfigDraftReqSchema, response: { 200: RepositoryRespSchema } }
		},
		async (req) => {
			const repository = await saveConfigDraft({
				repositoryRepo: fastify.repos.repositoryRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				projectId: req.membership!.projectId,
				yaml: req.body.yaml
			});

			return { repository };
		}
	);

	fastify.post(
		'/:id/pull-request',
		{
			preValidation: fastify.requireLeader,
			schema: { params: RepositoryIdParamsSchema, response: { 200: PullRequestRespSchema } }
		},
		async (req) => {
			return openConfigPullRequest({
				githubApp: fastify.services.githubApp,
				githubInstallationRepo: fastify.repos.githubInstallationRepo,
				repositoryRepo: fastify.repos.repositoryRepo,
				onboardingRunRepo: fastify.repos.onboardingRunRepo,
				id: req.params.id,
				projectId: req.membership!.projectId
			});
		}
	);

	fastify.get(
		'/:id/onboarding',
		{
			preValidation: fastify.requireLeader,
			schema: { params: RepositoryIdParamsSchema, response: { 200: RepositoryOnboardingRespSchema } }
		},
		async (req) => {
			return getRepositoryOnboarding({
				repositoryRepo: fastify.repos.repositoryRepo,
				onboardingRunRepo: fastify.repos.onboardingRunRepo,
				id: req.params.id,
				projectId: req.membership!.projectId
			});
		}
	);
};

export default routes;
