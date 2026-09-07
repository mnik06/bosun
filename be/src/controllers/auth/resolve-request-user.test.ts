import { describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { resolveRequestUser } from 'src/controllers/auth/resolve-request-user';
import { type UserRepo } from 'src/repos/users/user.repo';
import { type ResolvedToken, type SupabaseAuth } from 'src/services/auth/supabase-auth.service';
import { getIdService } from 'src/services/ids/id.service';
import { type User } from 'src/types/UserSchema';

const row: User = {
	id: 'u_existing',
	subId: '8e5f4a3b-0000-4000-8000-000000000001',
	email: 'a@b.co',
	createdAt: new Date('2026-01-01T00:00:00.000Z')
};

function build(resolved: ResolvedToken) {
	const provision = vi.fn().mockResolvedValue(row);

	return {
		provision,
		run: async () =>
			resolveRequestUser({
				supabaseAuth: { resolveToken: async () => resolved } as SupabaseAuth,
				idService: getIdService(),
				userRepo: { provision } as unknown as UserRepo,
				token: 'a.b.c'
			})
	};
}

describe('resolveRequestUser', () => {
	it('provisions the account on the identity provider and returns our row', async () => {
		const { provision, run } = build({
			status: 'ok',
			subId: row.subId,
			email: row.email
		});

		await expect(run()).resolves.toEqual(row);
		expect(provision).toHaveBeenCalledWith({
			id: expect.stringMatching(/^u_/) as unknown as string,
			subId: row.subId,
			email: row.email
		});
	});

	it('turns a refused token into 401', async () => {
		const { provision, run } = build({ status: 'rejected' });

		await expect(run()).rejects.toMatchObject({ statusCode: 401 });
		expect(provision).not.toHaveBeenCalled();
	});

	// The dangerous case: an outage must not be reported as a bad credential,
	// and must never fall through to provisioning a row.
	it('turns an unreachable identity provider into 503, never into access', async () => {
		const { provision, run } = build({ status: 'unavailable' });

		await expect(run()).rejects.toBeInstanceOf(HttpError);
		await expect(run()).rejects.toMatchObject({ statusCode: 503 });
		expect(provision).not.toHaveBeenCalled();
	});
});
