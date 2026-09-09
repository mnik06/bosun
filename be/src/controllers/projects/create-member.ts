import { HttpError } from 'src/api/errors/HttpError';
import { getProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { getUserRepo } from 'src/repos/users/user.repo';
import { type SupabaseAdmin } from 'src/services/auth/supabase-admin.service';
import { type Db } from 'src/services/drizzle/drizzle.service';
import { type IdService } from 'src/services/ids/id.service';
import { type KeyService } from 'src/services/keys/key.service';
import { type ProjectMember, type ProjectRole } from 'src/types/ProjectSchema';

export interface CreatedMember {
	member: ProjectMember;
	// Present only when this call minted the account. Returned exactly once and
	// never retrievable again — a leader who loses it removes the member and adds
	// them back.
	password: string | null;
}

export async function createMember(opts: {
	db: Db;
	supabaseAdmin: SupabaseAdmin;
	idService: IdService;
	keyService: KeyService;
	projectId: string;
	email: string;
	role: ProjectRole;
}): Promise<CreatedMember> {
	const userRepo = getUserRepo(opts.db);
	const existing = await userRepo.findByEmail(opts.email);

	if (existing) {
		const membership = await getProjectMemberRepo(opts.db).upsert({
			projectId: opts.projectId,
			userId: existing.id,
			role: opts.role
		});

		return {
			member: {
				userId: existing.id,
				email: existing.email,
				role: membership.role,
				createdAt: membership.createdAt
			},
			password: null
		};
	}

	const password = opts.keyService.generateMemberPassword();

	// Outside the transaction below on purpose: it is a network call, and holding a
	// database connection open across one ties up the pool on Supabase's latency.
	const account = await opts.supabaseAdmin.createUser({ email: opts.email, password });

	if (account.status === 'unavailable') {
		throw new HttpError(503, 'Account creation is temporarily unavailable');
	}

	if (account.status === 'rejected') {
		throw new HttpError(400, account.message);
	}

	// The address has an account we have never seen sign in, so there is no `users`
	// row to attach a membership to and no way to reach the account's id without
	// listing the whole directory. Asking them to sign in once is cheaper and
	// avoids guessing which account we would be adding.
	if (account.status === 'exists') {
		throw new HttpError(
			409,
			'That email already has an account. Ask them to sign in once, then add them.'
		);
	}

	const { subId } = account;

	return opts.db.transaction(async (tx) => {
		const user = await getUserRepo(tx).provision({
			id: opts.idService.createUserId(),
			subId,
			email: opts.email
		});
		const membership = await getProjectMemberRepo(tx).upsert({
			projectId: opts.projectId,
			userId: user.id,
			role: opts.role
		});

		return {
			member: {
				userId: user.id,
				email: user.email,
				role: membership.role,
				createdAt: membership.createdAt
			},
			password
		};
	});
}
