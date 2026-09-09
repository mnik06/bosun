import { and, asc, count, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { projectMembers, users } from 'src/services/drizzle/schema';
import {
	ProjectMemberSchema,
	ProjectMembershipSchema,
	type ProjectMember,
	type ProjectMembership,
	type ProjectRole
} from 'src/types/ProjectSchema';

const columns = {
	projectId: projectMembers.projectId,
	userId: projectMembers.userId,
	role: projectMembers.role,
	createdAt: projectMembers.createdAt
};

export function getProjectMemberRepo(db: DbOrTx) {
	return {
		async get(opts: { projectId: string; userId: string }): Promise<ProjectMembership | null> {
			const [row] = await db
				.select(columns)
				.from(projectMembers)
				.where(
					and(
						eq(projectMembers.projectId, opts.projectId),
						eq(projectMembers.userId, opts.userId)
					)
				);

			return row ? ProjectMembershipSchema.parse(row) : null;
		},

		async list(projectId: string): Promise<ProjectMember[]> {
			const rows = await db
				.select({
					userId: projectMembers.userId,
					email: users.email,
					role: projectMembers.role,
					createdAt: projectMembers.createdAt
				})
				.from(projectMembers)
				.innerJoin(users, eq(users.id, projectMembers.userId))
				.where(eq(projectMembers.projectId, projectId))
				.orderBy(asc(users.email));

			return rows.map((row) => ProjectMemberSchema.parse(row));
		},

		// `do update` rather than `do nothing`: adding somebody who is already a
		// member is a role change, not a failure, and `do nothing` returns no row.
		async upsert(opts: {
			projectId: string;
			userId: string;
			role: ProjectRole;
		}): Promise<ProjectMembership> {
			const [row] = await db
				.insert(projectMembers)
				.values(opts)
				.onConflictDoUpdate({
					target: [projectMembers.projectId, projectMembers.userId],
					set: { role: opts.role }
				})
				.returning(columns);

			return ProjectMembershipSchema.parse(row);
		},

		async setRole(opts: {
			projectId: string;
			userId: string;
			role: ProjectRole;
		}): Promise<ProjectMembership | null> {
			const [row] = await db
				.update(projectMembers)
				.set({ role: opts.role })
				.where(
					and(
						eq(projectMembers.projectId, opts.projectId),
						eq(projectMembers.userId, opts.userId)
					)
				)
				.returning(columns);

			return row ? ProjectMembershipSchema.parse(row) : null;
		},

		async remove(opts: { projectId: string; userId: string }): Promise<boolean> {
			const rows = await db
				.delete(projectMembers)
				.where(
					and(
						eq(projectMembers.projectId, opts.projectId),
						eq(projectMembers.userId, opts.userId)
					)
				)
				.returning({ userId: projectMembers.userId });

			return rows.length > 0;
		},

		// Read inside the same transaction as the demotion or removal it guards, so
		// two leaders standing each other down concurrently cannot both pass the
		// check and leave the project with nobody who can manage it.
		async countLeaders(projectId: string): Promise<number> {
			const [row] = await db
				.select({ total: count() })
				.from(projectMembers)
				.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'leader')));

			return row?.total ?? 0;
		}
	};
}

export type ProjectMemberRepo = ReturnType<typeof getProjectMemberRepo>;
