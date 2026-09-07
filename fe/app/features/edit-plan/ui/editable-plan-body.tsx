import { Text } from '@mantine/core'

import type { Plan } from '~/entities/plan'
import { useUpdatePlan } from '~/features/edit-plan/api/use-update-plan'
import { InlineEdit, MarkdownBlock } from '~/shared/ui'

export function EditablePlanBody ({ plan }: { plan: Plan }) {
	const update = useUpdatePlan(plan.id)

	return (
		<InlineEdit
			label="Body"
			multiline
			value={plan.bodyMd ?? ''}
			placeholder="The plan, in markdown"
			saving={update.isPending}
			onSave={(bodyMd) => {
				update.mutate({ bodyMd })
			}}
		>
			{plan.bodyMd === null ? (
				<Text size="sm" c="dimmed">
					No body yet.
				</Text>
			) : (
				<MarkdownBlock source={plan.bodyMd} />
			)}
		</InlineEdit>
	)
}
