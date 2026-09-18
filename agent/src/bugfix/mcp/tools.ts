import { z } from 'zod';
import { mcpToolDefinition, textToolResult, type PendingQuestion } from '../../sessions/mcp-server';
import { type BosunApiService } from '../../services/bosun-api.service';

export const ReportBugsArgsSchema = z.object({
	descriptions: z.array(z.string().min(1)).min(1)
});

export const UpdateBugStatusArgsSchema = z
	.object({
		bugId: z.string().min(1),
		status: z.enum(['fixing', 'fixed', 'failed']),
		note: z.string().min(1).optional()
	})
	.refine((value) => value.status !== 'failed' || value.note !== undefined, {
		message: 'note is required when marking a bug failed — it is what the person reads instead of trying it again',
		path: ['note']
	});

const REPORT_BUGS_DEFINITION = mcpToolDefinition({
	name: 'report_bugs',
	description:
		'Parse the message you were just handed into one or more individual bugs and record them, one description per bug. Call it once per round, only when the message actually names something broken — a vague or empty report is answered in your reply text instead, with no call here. Returns each new bug with the id it was assigned, which is what `update_bug_status` addresses it by.',
	schema: ReportBugsArgsSchema
});

const UPDATE_BUG_STATUS_DEFINITION = mcpToolDefinition({
	name: 'update_bug_status',
	description:
		'Move one bug, by the id `report_bugs` gave it, to "fixing" when you start it and "fixed" or "failed" when you finish — several bugs can be "fixing" at once. A "failed" bug must carry a note explaining why it could not be fixed; that note is what the person reads, not a silent gap.',
	schema: UpdateBugStatusArgsSchema
});

export const BUGFIX_TOOL_DEFINITIONS = [REPORT_BUGS_DEFINITION, UPDATE_BUG_STATUS_DEFINITION];

export const BUGFIX_MCP_TOOLS = BUGFIX_TOOL_DEFINITIONS.map((definition) => `mcp__bosun__${definition.name}`);

// No `bosun_ask` here and no `pending` map: an unattended orchestrator has
// nothing to wait on a person for, so `pending` is only threaded through
// because `SessionDispatchFactory` is shared with the sessions that do ask.
export function createBugfixDispatch(opts: { sessionId: string; buildId: string; bosunApi: BosunApiService }) {
	return function build(_pending: Map<string, PendingQuestion>) {
		return async function dispatch(name: string, args: unknown) {
			if (name === 'report_bugs') {
				const { descriptions } = ReportBugsArgsSchema.parse(args);
				const bugs = await opts.bosunApi.reportBugs({ buildId: opts.buildId, sessionId: opts.sessionId, descriptions });

				return textToolResult(JSON.stringify(bugs));
			}

			if (name === 'update_bug_status') {
				const { bugId, status, note } = UpdateBugStatusArgsSchema.parse(args);
				const bug = await opts.bosunApi.updateBugStatus({ bugId, sessionId: opts.sessionId, status, note });

				return textToolResult(JSON.stringify(bug));
			}

			throw new Error(`unknown tool ${name}`);
		};
	};
}
