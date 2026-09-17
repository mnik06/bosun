import { asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { verifyFindings } from 'src/services/drizzle/schema';
import { VerifyFindingSchema, type FindingStatus, type VerifyFinding } from 'src/types/BuildSchema';

const columns = {
	id: verifyFindings.id,
	buildId: verifyFindings.buildId,
	runId: verifyFindings.runId,
	acCode: verifyFindings.acCode,
	kind: verifyFindings.kind,
	reproduction: verifyFindings.reproduction,
	severity: verifyFindings.severity,
	status: verifyFindings.status,
	note: verifyFindings.note,
	acceptedByUserId: verifyFindings.acceptedByUserId,
	createdAt: verifyFindings.createdAt
};

export function getVerifyFindingRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			buildId: string;
			runId: string;
			acCode: string | null;
			kind: VerifyFinding['kind'];
			reproduction: string;
			severity: VerifyFinding['severity'];
		}): Promise<VerifyFinding> {
			const [row] = await db.insert(verifyFindings).values(opts).returning(columns);

			return VerifyFindingSchema.parse(row);
		},

		async getById(id: string): Promise<VerifyFinding | null> {
			const [row] = await db.select(columns).from(verifyFindings).where(eq(verifyFindings.id, id));

			return row ? VerifyFindingSchema.parse(row) : null;
		},

		async listForBuild(buildId: string): Promise<VerifyFinding[]> {
			const rows = await db
				.select(columns)
				.from(verifyFindings)
				.where(eq(verifyFindings.buildId, buildId))
				.orderBy(asc(verifyFindings.createdAt));

			return rows.map((row) => VerifyFindingSchema.parse(row));
		},

		async update(opts: {
			id: string;
			status: FindingStatus;
			note?: string | null;
			acceptedByUserId?: string | null;
		}): Promise<VerifyFinding | null> {
			const { id, ...changes } = opts;
			const [row] = await db.update(verifyFindings).set(changes).where(eq(verifyFindings.id, id)).returning(columns);

			return row ? VerifyFindingSchema.parse(row) : null;
		}
	};
}

export type VerifyFindingRepo = ReturnType<typeof getVerifyFindingRepo>;
