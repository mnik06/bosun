import { type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

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

// The unit's PATH carries ~/.local/bin, where Claude Code installs itself, and
// the node bosun put under ~/.bosun/toolchains; an interactive shell has neither.
// A command that checks what a session would find has to look where the session
// looks, or it reports `claude` or `npx` missing while both sit on disk.
export function withLocalTools(): void {
	const home = os.homedir();
	const toolchains = path.join(home, '.bosun', 'toolchains');
	let nodes: string[] = [];

	try {
		nodes = fs
			.readdirSync(toolchains)
			.filter((entry) => entry.startsWith('node-'))
			.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
	} catch {
		nodes = [];
	}

	const current = (process.env.PATH ?? '').split(':').filter(Boolean);
	const extra = [
		...nodes.slice(0, 1).map((entry) => path.join(toolchains, entry, 'bin')),
		path.join(home, '.local', 'bin')
	].filter((dir) => fs.existsSync(dir) && !current.includes(dir));

	process.env.PATH = [...extra, ...current].join(':');
}
