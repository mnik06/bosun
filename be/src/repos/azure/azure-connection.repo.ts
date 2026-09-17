import { and, asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { azureConnections } from 'src/services/drizzle/schema';
import { AzureConnectionSchema, type AzureConnection } from 'src/types/AzureSchema';

const columns = {
	id: azureConnections.id,
	projectId: azureConnections.projectId,
	organization: azureConnections.organization,
	status: azureConnections.status,
	lastError: azureConnections.lastError,
	brokenAt: azureConnections.brokenAt,
	createdByUserId: azureConnections.createdByUserId,
	createdAt: azureConnections.createdAt
};

// The PAT itself — `encryptedPat` — is read only by `getEncryptedPatById`, never
// by any method that returns an `AzureConnection`: every other query here parses
// through `AzureConnectionSchema`, which has no field for it, so a route that
// forwards a repo row can never leak it by accident (AC-20).
export function getAzureConnectionRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			projectId: string;
			organization: string;
			encryptedPat: string;
			createdByUserId: string;
		}): Promise<AzureConnection> {
			const [row] = await db.insert(azureConnections).values(opts).returning(columns);

			return AzureConnectionSchema.parse(row);
		},

		async listForProject(projectId: string): Promise<AzureConnection[]> {
			const rows = await db
				.select(columns)
				.from(azureConnections)
				.where(eq(azureConnections.projectId, projectId))
				.orderBy(asc(azureConnections.createdAt));

			return rows.map((row) => AzureConnectionSchema.parse(row));
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<AzureConnection | null> {
			const [row] = await db
				.select(columns)
				.from(azureConnections)
				.where(and(eq(azureConnections.id, opts.id), eq(azureConnections.projectId, opts.projectId)));

			return row ? AzureConnectionSchema.parse(row) : null;
		},

		// Unscoped: reached from a repository row whose project is already known,
		// the same shape `githubInstallationRepo.getById` takes.
		async getById(id: string): Promise<AzureConnection | null> {
			const [row] = await db.select(columns).from(azureConnections).where(eq(azureConnections.id, id));

			return row ? AzureConnectionSchema.parse(row) : null;
		},

		async getByOrganization(opts: { projectId: string; organization: string }): Promise<AzureConnection | null> {
			const [row] = await db
				.select(columns)
				.from(azureConnections)
				.where(and(eq(azureConnections.projectId, opts.projectId), eq(azureConnections.organization, opts.organization)));

			return row ? AzureConnectionSchema.parse(row) : null;
		},

		async getEncryptedPatById(opts: { id: string; projectId: string }): Promise<string | null> {
			const [row] = await db
				.select({ encryptedPat: azureConnections.encryptedPat })
				.from(azureConnections)
				.where(and(eq(azureConnections.id, opts.id), eq(azureConnections.projectId, opts.projectId)));

			return row?.encryptedPat ?? null;
		},

		// Rotation. Leaves status and repositories untouched — replacing the token is
		// not the same act as reconnecting, and neither detaches anything (AC-15).
		async rotatePat(opts: { id: string; projectId: string; encryptedPat: string }): Promise<AzureConnection | null> {
			const [row] = await db
				.update(azureConnections)
				.set({ encryptedPat: opts.encryptedPat, status: 'active', lastError: null, brokenAt: null })
				.where(and(eq(azureConnections.id, opts.id), eq(azureConnections.projectId, opts.projectId)))
				.returning(columns);

			return row ? AzureConnectionSchema.parse(row) : null;
		},

		// Cascades to every repository the connection owns, and through them their
		// builds and onboarding history — the same blast radius deleting a
		// `github_installations` row already has.
		async deleteOwned(opts: { id: string; projectId: string }): Promise<boolean> {
			const rows = await db
				.delete(azureConnections)
				.where(and(eq(azureConnections.id, opts.id), eq(azureConnections.projectId, opts.projectId)))
				.returning({ id: azureConnections.id });

			return rows.length > 0;
		}
	};
}

export type AzureConnectionRepo = ReturnType<typeof getAzureConnectionRepo>;
