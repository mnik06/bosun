import { and, asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { repositories } from 'src/services/drizzle/schema';
import { RepositorySchema, type Repository } from 'src/types/RepositorySchema';

const columns = {
	id: repositories.id,
	projectId: repositories.projectId,
	installationId: repositories.installationId,
	githubRepoId: repositories.githubRepoId,
	fullName: repositories.fullName,
	defaultBranch: repositories.defaultBranch,
	configDraft: repositories.configDraft,
	configOnDefault: repositories.configOnDefault,
	createdAt: repositories.createdAt
};

export function getRepositoryRepo(db: DbOrTx) {
	return {
		// Null when the project already has it, so adding twice reads as a conflict
		// rather than as a second row for one repository.
		async create(opts: {
			id: string;
			projectId: string;
			installationId: string;
			githubRepoId: number;
			fullName: string;
			defaultBranch: string;
		}): Promise<Repository | null> {
			const [row] = await db
				.insert(repositories)
				.values(opts)
				.onConflictDoNothing({ target: [repositories.projectId, repositories.githubRepoId] })
				.returning(columns);

			return row ? RepositorySchema.parse(row) : null;
		},

		async listForProject(projectId: string): Promise<Repository[]> {
			const rows = await db
				.select(columns)
				.from(repositories)
				.where(eq(repositories.projectId, projectId))
				.orderBy(asc(repositories.fullName));

			return rows.map((row) => RepositorySchema.parse(row));
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<Repository | null> {
			const [row] = await db
				.select(columns)
				.from(repositories)
				.where(and(eq(repositories.id, opts.id), eq(repositories.projectId, opts.projectId)));

			return row ? RepositorySchema.parse(row) : null;
		},

		// Unscoped: reached from a machine row the caller has already authenticated.
		async getById(id: string): Promise<Repository | null> {
			const [row] = await db.select(columns).from(repositories).where(eq(repositories.id, id));

			return row ? RepositorySchema.parse(row) : null;
		},

		async saveConfigDraft(opts: { id: string; configDraft: string }): Promise<Repository | null> {
			const [row] = await db
				.update(repositories)
				.set({ configDraft: opts.configDraft })
				.where(eq(repositories.id, opts.id))
				.returning(columns);

			return row ? RepositorySchema.parse(row) : null;
		},

		async saveConfigOnDefault(opts: { id: string; configOnDefault: boolean }): Promise<Repository | null> {
			const [row] = await db
				.update(repositories)
				.set({ configOnDefault: opts.configOnDefault })
				.where(eq(repositories.id, opts.id))
				.returning(columns);

			return row ? RepositorySchema.parse(row) : null;
		}
	};
}

export type RepositoryRepo = ReturnType<typeof getRepositoryRepo>;
