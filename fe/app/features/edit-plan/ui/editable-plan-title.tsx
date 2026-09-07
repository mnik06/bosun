import { Title } from '@mantine/core'

import type { Plan } from '~/entities/plan'
import { useUpdatePlan } from '~/features/edit-plan/api/use-update-plan'
import { InlineEdit } from '~/shared/ui'

export function EditablePlanTitle ({ plan }: { plan: Plan }) {
	const update = useUpdatePlan(plan.id)

	return (
		<InlineEdit
			label="Title"
			value={plan.title ?? ''}
			placeholder="Name this plan"
			saving={update.isPending}
			onSave={(title) => {
				update.mutate({ title })
			}}
		>
			<Title order={2}>{plan.title ?? 'Untitled'}</Title>
		</InlineEdit>
	)
}
