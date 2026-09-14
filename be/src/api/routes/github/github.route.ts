import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	AvailableRepositoryListRespSchema,
	ConnectInstallationReqSchema,
	ImportInstallationsReqSchema,
	InstallationListRespSchema,
	InstallationRespSchema,
	InstallUrlRespSchema
} from 'src/api/routes/schemas/github/GithubSchemas';
import { connectInstallation } from 'src/controllers/github/connect-installation';
import { getInstallUrl } from 'src/controllers/github/get-install-url';
import { importInstallations } from 'src/controllers/github/import-installations';
import { listAvailableRepositories } from 'src/controllers/github/list-available-repositories';
import { listInstallations } from 'src/controllers/github/list-installations';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get('/install-url', { schema: { response: { 200: InstallUrlRespSchema } } }, async (req) => {
		return getInstallUrl({
			githubApp: fastify.services.githubApp,
			userId: req.user!.id,
			projectId: req.membership!.projectId
		});
	});

	fastify.post(
		'/installations',
		{ schema: { body: ConnectInstallationReqSchema, response: { 200: InstallationRespSchema } } },
		async (req) => {
			const installation = await connectInstallation({
				githubApp: fastify.services.githubApp,
				githubInstallationRepo: fastify.repos.githubInstallationRepo,
				idService: fastify.services.idService,
				userId: req.user!.id,
				projectId: req.membership!.projectId,
				installationId: req.body.installationId,
				code: req.body.code,
				state: req.body.state
			});

			return { installation };
		}
	);

	fastify.post(
		'/installations/import',
		{ schema: { body: ImportInstallationsReqSchema, response: { 200: InstallationListRespSchema } } },
		async (req) => {
			return importInstallations({
				githubApp: fastify.services.githubApp,
				githubInstallationRepo: fastify.repos.githubInstallationRepo,
				idService: fastify.services.idService,
				userId: req.user!.id,
				projectId: req.membership!.projectId,
				code: req.body.code,
				state: req.body.state
			});
		}
	);

	fastify.get('/installations', { schema: { response: { 200: InstallationListRespSchema } } }, async (req) => {
		return listInstallations({
			githubInstallationRepo: fastify.repos.githubInstallationRepo,
			projectId: req.membership!.projectId
		});
	});

	fastify.get('/repositories', { schema: { response: { 200: AvailableRepositoryListRespSchema } } }, async (req) => {
		return listAvailableRepositories({
			githubApp: fastify.services.githubApp,
			githubInstallationRepo: fastify.repos.githubInstallationRepo,
			projectId: req.membership!.projectId
		});
	});
};

export default routes;
