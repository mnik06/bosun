import { type ChildProcess } from 'child_process';

export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A process spawned detached, in its own group, so a signal meant for it reaches
// whatever it spawned as well. `-pid` addresses the group; it throws once the
// group is already gone, and the child itself is signalled instead — the same
// fallback either caller needs.
export function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
	try {
		process.kill(-child.pid!, signal);
	} catch {
		child.kill(signal);
	}
}
