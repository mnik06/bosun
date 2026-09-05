export function apiWsUrl (path: string): string {
	const url = new URL(import.meta.env.VITE_API_URL)

	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	url.pathname = path

	return url.toString()
}
