import { type ClaudeSession } from './process';
import { type SessionMcpServer } from './mcp-server';

// The shutdown most session drivers perform once a session is done: forget it,
// stop its process if the model left one running, and close the MCP server that
// was handed to it. `execution/session.ts` also tears down a stack and
// `integration/session.ts` keeps its entry around with its fields cleared rather
// than deleting it, so each keeps its own version instead of this one.
export function teardownSession(
	sessions: Map<string, { process: ClaudeSession | null; mcp: SessionMcpServer }>,
	id: string
): void {
	const session = sessions.get(id);

	if (!session) {
		return;
	}

	sessions.delete(id);
	session.process?.kill();
	void session.mcp.close();
}
