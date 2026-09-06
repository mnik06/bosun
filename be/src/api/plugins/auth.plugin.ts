import { type preValidationAsyncHookHandler } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';
import { resolveRequestUser } from 'src/controllers/auth/resolve-request-user';
import { type UserRepo } from 'src/repos/users/user.repo';
import { type SupabaseAuth } from 'src/services/auth/supabase-auth.service';
import { readBearerToken } from 'src/utils/general';

export function getRequireUserHook(deps: {
	supabaseAuth: SupabaseAuth;
	userRepo: UserRepo;
}): preValidationAsyncHookHandler {
	return async function requireUser(request): Promise<void> {
		const token = readBearerToken(request.headers.authorization);

		if (!token) {
			throw new HttpError(401, 'Unauthorized');
		}

		request.user = await resolveRequestUser({
			supabaseAuth: deps.supabaseAuth,
			userRepo: deps.userRepo,
			token
		});
	};
}
