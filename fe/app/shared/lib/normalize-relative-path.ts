export function normalizeRelativePath (path: string): string {
	return path.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}
