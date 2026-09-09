import { asc, eq } from 'drizzle-orm';
import { type getDb } from 'src/services/drizzle/drizzle.service';
import { projectMembers, projects } from 'src/services/drizzle/schema';
import {
	ProjectSchema,
	ProjectWithRoleSchema,
	type Project,
	type ProjectWithRole
} from 'src/types/ProjectSchema';

type Db = ReturnType<typeof getDb>;

const columns = {
	id: projects.id,
	name: projects.name,
	createdAt: projects.createdAt
};

export function getProjectRepo(db: Db) {
	return {
		async create(opts: { id: string; name: string }): Promise<Project> {
			const [row] = await db.insert(projects).values(opts).returning(columns);

			return ProjectSchema.parse(row);
		},

		async getById(id: string): Promise<Project | null> {
			const [row] = await db.select(columns).from(projects).where(eq(projects.id, id));

			return row ? ProjectSchema.parse(row) : null;
		},

		async listForUser(userId: string): Promise<ProjectWithRole[]> {
			const rows = await db
				.select({ ...columns, role: projectMembers.role })
				.from(projectMembers)
				.innerJoin(projects, eq(projects.id, projectMembers.projectId))
				.where(eq(projectMembers.userId, userId))
				.orderBy(asc(projects.name));

			return rows.map((row) => ProjectWithRoleSchema.parse(row));
		},

		async listAll(): Promise<Project[]> {
			const rows = await db.select(columns).from(projects).orderBy(asc(projects.name));

			return rows.map((row) => ProjectSchema.parse(row));
		},

		async rename(opts: { id: string; name: string }): Promise<Project | null> {
			const [row] = await db
				.update(projects)
				.set({ name: opts.name })
				.where(eq(projects.id, opts.id))
				.returning(columns);

			return row ? ProjectSchema.parse(row) : null;
		},

		async delete(id: string): Promise<boolean> {
			const rows = await db
				.delete(projects)
				.where(eq(projects.id, id))
				.returning({ id: projects.id });

			return rows.length > 0;
		}
	};
}

export type ProjectRepo = ReturnType<typeof getProjectRepo>;
