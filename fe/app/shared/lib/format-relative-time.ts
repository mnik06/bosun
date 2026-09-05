import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export function formatRelativeTime (iso: string | null): string {
	return iso === null ? 'never' : dayjs(iso).fromNow()
}
