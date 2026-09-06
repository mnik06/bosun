import { eq } from 'drizzle-orm';
import { type getDb } from 'src/services/drizzle/drizzle.service';
import { users } from 'src/services/drizzle/schema';
import { UserSchema, type User } from 'src/types/UserSchema';

type Db = ReturnType<typeof getDb>;

const publicColumns = {
	id: users.id,
	subId: users.subId,
	email: users.email,
	createdAt: users.createdAt
};

export function getUserRepo(db: Db) {
	return {
		async getBySubId(subId: string): Promise<User | null> {
			const [row] = await db.select(publicColumns).from(users).where(eq(users.subId, subId));

			return row ? UserSchema.parse(row) : null;
		},

		// `do update` rather than `do nothing`: a losing race must still get the
		// winner's row back, and `do nothing` returns no row at all.
		async provision(opts: { id: string; subId: string; email: string }): Promise<User> {
			const [row] = await db
				.insert(users)
				.values(opts)
				.onConflictDoUpdate({ target: users.subId, set: { email: opts.email } })
				.returning(publicColumns);

			return UserSchema.parse(row);
		}
	};
}

export type UserRepo = ReturnType<typeof getUserRepo>;
