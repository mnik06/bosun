// One scheduling pass per machine at a time. A run settling, a webhook and a
// person pressing Release all schedule the same machine within the same second;
// two passes reading the same memory and each admitting a build is two builds
// against memory that holds one. Process-local, which holds because the backend
// runs as one instance — see `sockets/registry.service.md`.
export function getLineLockService() {
	const tails = new Map<string, Promise<unknown>>();

	return {
		async run<T>(key: string, task: () => Promise<T>): Promise<T> {
			const previous = tails.get(key) ?? Promise.resolve();
			const next = previous.then(task, task);
			const settled = next.catch(() => undefined);

			tails.set(key, settled);

			try {
				return await next;
			} finally {
				if (tails.get(key) === settled) {
					tails.delete(key);
				}
			}
		}
	};
}

export type LineLockService = ReturnType<typeof getLineLockService>;
