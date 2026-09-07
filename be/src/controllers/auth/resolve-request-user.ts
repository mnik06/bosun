import { HttpError } from 'src/api/errors/HttpError';
import { type UserRepo } from 'src/repos/users/user.repo';
import { type SupabaseAuth } from 'src/services/auth/supabase-auth.service';
import { type IdService } from 'src/services/ids/id.service';
import { type User } from 'src/types/UserSchema';

export async function resolveRequestUser(opts: {
	supabaseAuth: SupabaseAuth;
	idService: IdService;
	userRepo: UserRepo;
	token: string;
}): Promise<User> {
	const resolved = await opts.supabaseAuth.resolveToken(opts.token);

	if (resolved.status === 'unavailable') {
		throw new HttpError(503, 'Authentication is temporarily unavailable');
	}

	if (resolved.status === 'rejected') {
		throw new HttpError(401, 'Unauthorized');
	}

	return opts.userRepo.provision({
		id: opts.idService.createUserId(),
		subId: resolved.subId,
		email: resolved.email
	});
}
