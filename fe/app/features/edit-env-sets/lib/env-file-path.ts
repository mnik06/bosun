import { stripSlashes } from '~/shared/lib'

export function envFilePath (path: string): string {
	const relative = stripSlashes(path)

	return relative === '' || relative === '.' ? '.env' : `${relative}/.env`
}
