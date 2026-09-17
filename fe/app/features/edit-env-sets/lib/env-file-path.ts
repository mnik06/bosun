import { normalizeRelativePath } from '~/shared/lib'

export function envFilePath (path: string): string {
	const relative = normalizeRelativePath(path)

	return relative === '' || relative === '.' ? '.env' : `${relative}/.env`
}
