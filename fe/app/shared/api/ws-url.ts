export function apiWsUrl (path: string): string {
	const url = new URL(path, import.meta.env.VITE_API_URL)

	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'

	return url.toString()
}
