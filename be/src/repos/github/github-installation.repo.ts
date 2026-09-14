import { and, asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { githubInstallations } from 'src/services/drizzle/schema';
import { GithubInstallationSchema, type GithubInstallation } from 'src/types/RepositorySchema';

const columns = {
	id: githubInstallations.id,
	projectId: githubInstallations.projectId,
	installationId: githubInstallations.installationId,
	accountLogin: githubInstallations.accountLogin,
	createdByUserId: githubInstallations.createdByUserId,
	createdAt: githubInstallations.createdAt
};

export function getGithubInstallationRepo(db: DbOrTx) {
	return {
		// Connecting the same installation again refreshes its account name rather
		// than failing: an organization renamed on GitHub is still the same install.
		async upsert(opts: {
			id: string;
			projectId: string;
			installationId: number;
			accountLogin: string;
			createdByUserId: string;
		}): Promise<GithubInstallation> {
			const [row] = await db
				.insert(githubInstallations)
				.values(opts)
				.onConflictDoUpdate({
					target: [githubInstallations.projectId, githubInstallations.installationId],
					set: { accountLogin: opts.accountLogin }
				})
				.returning(columns);

			return GithubInstallationSchema.parse(row);
		},

		async listForProject(projectId: string): Promise<GithubInstallation[]> {
			const rows = await db
				.select(columns)
				.from(githubInstallations)
				.where(eq(githubInstallations.projectId, projectId))
				.orderBy(asc(githubInstallations.createdAt));

			return rows.map((row) => GithubInstallationSchema.parse(row));
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<GithubInstallation | null> {
			const [row] = await db
				.select(columns)
				.from(githubInstallations)
				.where(and(eq(githubInstallations.id, opts.id), eq(githubInstallations.projectId, opts.projectId)));

			return row ? GithubInstallationSchema.parse(row) : null;
		},

		// Unscoped: reached from a repository row whose project is already known.
		async getById(id: string): Promise<GithubInstallation | null> {
			const [row] = await db.select(columns).from(githubInstallations).where(eq(githubInstallations.id, id));

			return row ? GithubInstallationSchema.parse(row) : null;
		}
	};
}

export type GithubInstallationRepo = ReturnType<typeof getGithubInstallationRepo>;
