import { and, asc, eq, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { planMessages } from 'src/services/drizzle/schema';
import {
	PlanMessageSchema,
	type PlanMessage,
	type PlanMessageContent,
	type PlanMessageRole
} from 'src/types/PlanSchema';

const columns = {
	id: planMessages.id,
	planId: planMessages.planId,
	seq: planMessages.seq,
	role: planMessages.role,
	content: planMessages.content,
	createdAt: planMessages.createdAt
};

export function getPlanMessageRepo(db: DbOrTx) {
	return {
		// The next sequence number is computed inside the insert rather than read
		// first: a read-then-write would hand the same number to a stream frame and
		// an answer arriving over HTTP at the same moment, and the unique index
		// would then reject one of them at random.
		async append(opts: {
			id: string;
			planId: string;
			role: PlanMessageRole;
			content: PlanMessageContent;
		}): Promise<PlanMessage> {
			const [row] = await db
				.insert(planMessages)
				.values({
					id: opts.id,
					planId: opts.planId,
					role: opts.role,
					content: opts.content,
					seq: sql`(select coalesce(max(${planMessages.seq}), 0) + 1 from ${planMessages} where ${planMessages.planId} = ${opts.planId})`
				})
				.returning(columns);

			return PlanMessageSchema.parse(row);
		},

		async listByPlan(planId: string): Promise<PlanMessage[]> {
			const rows = await db
				.select(columns)
				.from(planMessages)
				.where(eq(planMessages.planId, planId))
				.orderBy(asc(planMessages.seq));

			return rows.map((row) => PlanMessageSchema.parse(row));
		},

		async findByQuestionId(opts: {
			planId: string;
			questionId: string;
			role: Extract<PlanMessageRole, 'question' | 'answer'>;
		}): Promise<PlanMessage | null> {
			const [row] = await db
				.select(columns)
				.from(planMessages)
				.where(
					and(
						eq(planMessages.planId, opts.planId),
						eq(planMessages.role, opts.role),
						sql`${planMessages.content}->>'questionId' = ${opts.questionId}`
					)
				);

			return row ? PlanMessageSchema.parse(row) : null;
		}
	};
}

export type PlanMessageRepo = ReturnType<typeof getPlanMessageRepo>;
