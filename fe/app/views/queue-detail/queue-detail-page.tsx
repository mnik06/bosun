import { QueueDetail } from '~/widgets/queue-detail'

import type { Route } from './+types/queue-detail-page'

export default function QueueDetailPage ({ params }: Route.ComponentProps) {
	return <QueueDetail queueId={params.queueId} />
}
