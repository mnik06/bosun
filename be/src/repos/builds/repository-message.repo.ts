import { asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { repositoryMessages } from 'src/services/drizzle/schema';
import {
	RepositoryMessageSchema,
	type RepositoryMessage,
	type RepositoryMessageRole
} from 'src/types/BuildSchema';

const columns = {
	id: repositoryMessages.id,
	repositoryId: repositoryMessages.repositoryId,
	role: repositoryMessages.role,
	content: repositoryMessages.content,
	createdAt: repositoryMessages.createdAt
};

export function getRepositoryMessageRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			repositoryId: string;
			role: RepositoryMessageRole;
			content: string;
		}): Promise<RepositoryMessage> {
			const [row] = await db.insert(repositoryMessages).values(opts).returning(columns);

			return RepositoryMessageSchema.parse(row);
		},

		async listForRepository(repositoryId: string): Promise<RepositoryMessage[]> {
			const rows = await db
				.select(columns)
				.from(repositoryMessages)
				.where(eq(repositoryMessages.repositoryId, repositoryId))
				.orderBy(asc(repositoryMessages.createdAt));

			return rows.map((row) => RepositoryMessageSchema.parse(row));
		}
	};
}

export type RepositoryMessageRepo = ReturnType<typeof getRepositoryMessageRepo>;
