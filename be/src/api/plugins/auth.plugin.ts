import { type preValidationAsyncHookHandler } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';
import { resolveMembership } from 'src/controllers/auth/resolve-membership';
import { resolveRequestUser } from 'src/controllers/auth/resolve-request-user';
import { type ProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { type ProjectRepo } from 'src/repos/projects/project.repo';
import { type UserRepo } from 'src/repos/users/user.repo';
import { type SupabaseAuth } from 'src/services/auth/supabase-auth.service';
import { type IdService } from 'src/services/ids/id.service';
import { readBearerToken } from 'src/utils/general';

export const PROJECT_ID_HEADER = 'x-project-id';

export function getRequireUserHook(deps: {
	supabaseAuth: SupabaseAuth;
	idService: IdService;
	userRepo: UserRepo;
}): preValidationAsyncHookHandler {
	return async function requireUser(request): Promise<void> {
		const token = readBearerToken(request.headers.authorization);

		if (!token) {
			throw new HttpError(401, 'Unauthorized');
		}

		request.user = await resolveRequestUser({
			supabaseAuth: deps.supabaseAuth,
			idService: deps.idService,
			userRepo: deps.userRepo,
			token
		});
	};
}

// A missing header is a 400 rather than a fallback to the caller's only project.
// A default here would mean a request that meant one project quietly acting on
// another the moment somebody joins a second one.
export function getRequireMembershipHook(deps: {
	projectRepo: ProjectRepo;
	projectMemberRepo: ProjectMemberRepo;
}): preValidationAsyncHookHandler {
	return async function requireMembership(request): Promise<void> {
		if (!request.user) {
			throw new HttpError(401, 'Unauthorized');
		}

		const projectId = request.headers[PROJECT_ID_HEADER];

		if (typeof projectId !== 'string' || projectId.length === 0) {
			throw new HttpError(400, `The ${PROJECT_ID_HEADER} header is required`);
		}

		request.membership = await resolveMembership({
			projectRepo: deps.projectRepo,
			projectMemberRepo: deps.projectMemberRepo,
			user: request.user,
			projectId
		});
	};
}

// The projects routes address a project by path rather than acting inside one, so
// they resolve membership from the param. Routes in that folder without a
// `projectId` param — listing and creating — are left to their own gate.
export function getRequireProjectParamMembershipHook(deps: {
	projectRepo: ProjectRepo;
	projectMemberRepo: ProjectMemberRepo;
}): preValidationAsyncHookHandler {
	return async function requireProjectParamMembership(request): Promise<void> {
		if (!request.user) {
			throw new HttpError(401, 'Unauthorized');
		}

		const { projectId } = request.params as { projectId?: string };

		if (!projectId) {
			return;
		}

		request.membership = await resolveMembership({
			projectRepo: deps.projectRepo,
			projectMemberRepo: deps.projectMemberRepo,
			user: request.user,
			projectId
		});
	};
}

// 403, not 404: the caller is a member and already knows the resource is there.
// Hiding it would leave the browser unable to tell "gone" from "not allowed".
export const requireLeader: preValidationAsyncHookHandler = async function requireLeader(
	request
): Promise<void> {
	if (request.membership?.role !== 'leader') {
		throw new HttpError(403, 'Only a project leader can do this');
	}
};

export const requireAppOwner: preValidationAsyncHookHandler = async function requireAppOwner(
	request
): Promise<void> {
	if (!request.user?.isAppOwner) {
		throw new HttpError(403, 'Only the app owner can do this');
	}
};
