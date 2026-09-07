import { type preValidationAsyncHookHandler } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';
import { resolveRequestUser } from 'src/controllers/auth/resolve-request-user';
import { type UserRepo } from 'src/repos/users/user.repo';
import { type SupabaseAuth } from 'src/services/auth/supabase-auth.service';
import { type IdService } from 'src/services/ids/id.service';
import { readBearerToken } from 'src/utils/general';

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
