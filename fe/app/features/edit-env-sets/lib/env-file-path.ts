export function envFilePath (path: string): string {
	const relative = path.trim().replace(/^\/+/, '').replace(/\/+$/, '')

	return relative === '' || relative === '.' ? '.env' : `${relative}/.env`
}
