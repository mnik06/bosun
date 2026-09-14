import fs from 'fs';

// The files a preflight reads that something other than the agent writes. The
// project env store is written through a temp file renamed over it, so the temp
// name counts as well: on some filesystems the rename reports only that name.
const WATCHED = new Set(['env', 'mcp.json', 'project-env.json']);
const DEBOUNCE_MS = 1_000;

export function isWatchedChange(filename: string | null): boolean {
	if (filename === null) {
		return true;
	}

	return WATCHED.has(filename) || filename.startsWith('.project-env.json.');
}

// Debounced: an `mcp add` writes the env file and then the config, and a store
// save is a write and a rename. One announce for the burst is what the browser
// needs, and several would each re-run every preflight probe.
export function watchBosunFiles(opts: { dir: string; onChange: () => void; debounceMs?: number }): () => void {
	let timer: NodeJS.Timeout | null = null;
	let watcher: fs.FSWatcher;

	try {
		fs.mkdirSync(opts.dir, { recursive: true, mode: 0o700 });
		watcher = fs.watch(opts.dir, (_event, filename) => {
			if (!isWatchedChange(filename === null ? null : String(filename))) {
				return;
			}

			if (timer !== null) {
				clearTimeout(timer);
			}

			timer = setTimeout(() => {
				timer = null;
				opts.onChange();
			}, opts.debounceMs ?? DEBOUNCE_MS);
		});
	} catch (error) {
		// A box whose kernel refuses a watch still works; changes then wait for the
		// next Refresh, which is how every machine worked before.
		console.error(`not watching ${opts.dir}: ${error instanceof Error ? error.message : 'watch failed'}`);

		return () => {};
	}

	watcher.on('error', (error) => {
		console.error(`stopped watching ${opts.dir}: ${error.message}`);
	});
	watcher.unref();

	return () => {
		watcher.close();

		if (timer !== null) {
			clearTimeout(timer);
		}
	};
}
