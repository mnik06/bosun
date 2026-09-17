export function stripSlashes (path: string): string {
	return path.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}
