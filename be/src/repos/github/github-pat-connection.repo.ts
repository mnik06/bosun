import { and, asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { githubPatConnections } from 'src/services/drizzle/schema';
import { GithubPatConnectionSchema, type GithubPatConnection } from 'src/types/GithubPatSchema';

const columns = {
	id: githubPatConnections.id,
	projectId: githubPatConnections.projectId,
	githubLogin: githubPatConnections.githubLogin,
	tokenType: githubPatConnections.tokenType,
	status: githubPatConnections.status,
	lastError: githubPatConnections.lastError,
	brokenAt: githubPatConnections.brokenAt,
	createdByUserId: githubPatConnections.createdByUserId,
	createdAt: githubPatConnections.createdAt
};

// The PAT itself — `encryptedToken` — is read only by `getEncryptedTokenById`,
// never by any method that returns a `GithubPatConnection`: every other query
// here parses through `GithubPatConnectionSchema`, which has no field for it, so
// a route that forwards a repo row can never leak it by accident (AC-54).
export function getGithubPatConnectionRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			projectId: string;
			githubLogin: string;
			tokenType: 'fine_grained' | 'classic';
			encryptedToken: string;
			createdByUserId: string;
		}): Promise<GithubPatConnection> {
			const [row] = await db.insert(githubPatConnections).values(opts).returning(columns);

			return GithubPatConnectionSchema.parse(row);
		},

		async listForProject(projectId: string): Promise<GithubPatConnection[]> {
			const rows = await db
				.select(columns)
				.from(githubPatConnections)
				.where(eq(githubPatConnections.projectId, projectId))
				.orderBy(asc(githubPatConnections.createdAt));

			return rows.map((row) => GithubPatConnectionSchema.parse(row));
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<GithubPatConnection | null> {
			const [row] = await db
				.select(columns)
				.from(githubPatConnections)
				.where(and(eq(githubPatConnections.id, opts.id), eq(githubPatConnections.projectId, opts.projectId)));

			return row ? GithubPatConnectionSchema.parse(row) : null;
		},

		// Unscoped: reached from a repository row whose project is already known,
		// the same shape `azureConnectionRepo.getById` takes.
		async getById(id: string): Promise<GithubPatConnection | null> {
			const [row] = await db.select(columns).from(githubPatConnections).where(eq(githubPatConnections.id, id));

			return row ? GithubPatConnectionSchema.parse(row) : null;
		},

		async getEncryptedTokenById(opts: { id: string; projectId: string }): Promise<string | null> {
			const [row] = await db
				.select({ encryptedToken: githubPatConnections.encryptedToken })
				.from(githubPatConnections)
				.where(and(eq(githubPatConnections.id, opts.id), eq(githubPatConnections.projectId, opts.projectId)));

			return row?.encryptedToken ?? null;
		},

		// Rotation. Leaves status and repositories untouched — replacing the token is
		// not the same act as reconnecting, and neither detaches anything (AC-17).
		async rotateToken(opts: { id: string; projectId: string; githubLogin: string; tokenType: 'fine_grained' | 'classic'; encryptedToken: string }): Promise<GithubPatConnection | null> {
			const [row] = await db
				.update(githubPatConnections)
				.set({ githubLogin: opts.githubLogin, tokenType: opts.tokenType, encryptedToken: opts.encryptedToken, status: 'active', lastError: null, brokenAt: null })
				.where(and(eq(githubPatConnections.id, opts.id), eq(githubPatConnections.projectId, opts.projectId)))
				.returning(columns);

			return row ? GithubPatConnectionSchema.parse(row) : null;
		},

		// Cascades to every repository the connection owns, the same blast radius
		// deleting an `azure_connections` or `github_installations` row already has.
		async deleteOwned(opts: { id: string; projectId: string }): Promise<boolean> {
			const rows = await db
				.delete(githubPatConnections)
				.where(and(eq(githubPatConnections.id, opts.id), eq(githubPatConnections.projectId, opts.projectId)))
				.returning({ id: githubPatConnections.id });

			return rows.length > 0;
		}
	};
}

export type GithubPatConnectionRepo = ReturnType<typeof getGithubPatConnectionRepo>;
