import { Page } from '~/shared/ui'
import { QueueDetail } from '~/widgets/queue-detail'

import type { Route } from './+types/queue-detail-page'

export default function QueueDetailPage ({ params }: Route.ComponentProps) {
	return (
		<Page>
			<QueueDetail queueId={params.queueId} />
		</Page>
	)
}
