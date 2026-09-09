import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
	CreateMemberReqSchema,
	MemberParamsSchema,
	ProjectIdParamsSchema,
	SetMemberRoleReqSchema
} from 'src/api/routes/schemas/projects/ProjectReqSchemas';
import {
	CreatedMemberRespSchema,
	MemberListRespSchema
} from 'src/api/routes/schemas/projects/ProjectRespSchemas';
import { createMember } from 'src/controllers/projects/create-member';
import { listMembers } from 'src/controllers/projects/list-members';
import { removeMember } from 'src/controllers/projects/remove-member';
import { setMemberRole } from 'src/controllers/projects/set-member-role';
import { ProjectMembershipSchema } from 'src/types/ProjectSchema';

const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.get(
		'/:projectId/members',
		{
			schema: { params: ProjectIdParamsSchema, response: { 200: MemberListRespSchema } }
		},
		async (req) => {
			return listMembers({
				projectMemberRepo: fastify.repos.projectMemberRepo,
				projectId: req.params.projectId
			});
		}
	);

	fastify.post(
		'/:projectId/members',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: ProjectIdParamsSchema,
				body: CreateMemberReqSchema,
				response: { 201: CreatedMemberRespSchema }
			}
		},
		async (req, reply) => {
			const created = await createMember({
				db: fastify.db,
				supabaseAdmin: fastify.services.supabaseAdmin,
				idService: fastify.services.idService,
				keyService: fastify.services.keyService,
				projectId: req.params.projectId,
				email: req.body.email,
				role: req.body.role
			});

			return reply.status(201).send(created);
		}
	);

	fastify.patch(
		'/:projectId/members/:userId',
		{
			preValidation: fastify.requireLeader,
			schema: {
				params: MemberParamsSchema,
				body: SetMemberRoleReqSchema,
				response: { 200: ProjectMembershipSchema }
			}
		},
		async (req) => {
			return setMemberRole({
				db: fastify.db,
				projectId: req.params.projectId,
				userId: req.params.userId,
				role: req.body.role
			});
		}
	);

	fastify.delete(
		'/:projectId/members/:userId',
		{
			preValidation: fastify.requireLeader,
			schema: { params: MemberParamsSchema }
		},
		async (req, reply) => {
			await removeMember({
				db: fastify.db,
				socketRegistry: fastify.services.socketRegistry,
				projectId: req.params.projectId,
				userId: req.params.userId
			});

			return reply.status(204).send(undefined);
		}
	);
};

export default routes;
