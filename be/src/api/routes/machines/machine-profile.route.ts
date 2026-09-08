import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MachineIdParamsSchema } from 'src/api/routes/schemas/machines/MachineIdParamsSchema';
import { saveProjectProfile } from 'src/controllers/machines/save-project-profile';
import { MachineSchema } from 'src/types/MachineSchema';
import { ProjectProfileSchema } from 'src/types/ProjectProfileSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.patch(
		'/:id/profile',
		{
			schema: {
				params: MachineIdParamsSchema,
				body: ProjectProfileSchema,
				response: { 200: MachineSchema }
			}
		},
		async (req) => {
			return saveProjectProfile({
				machineRepo: fastify.repos.machineRepo,
				socketRegistry: fastify.services.socketRegistry,
				id: req.params.id,
				userId: req.user!.id,
				projectProfile: req.body
			});
		}
	);

};

export default routes;
