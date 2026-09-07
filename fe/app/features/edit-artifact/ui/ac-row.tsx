import { ActionIcon, Badge, Group, Select, Text } from '@mantine/core'
import { TrashIcon } from 'lucide-react'

import type { Ac, Slice } from '~/entities/plan'
import { useEditArtifact } from '~/features/edit-artifact/api/use-edit-artifact'
import { InlineEdit } from '~/shared/ui'

export function AcRow ({
	planId,
	ac,
	slices,
	editable
}: {
	planId: string
	ac: Ac
	slices: Slice[]
	editable: boolean
}) {
	const edit = useEditArtifact(planId)

	const label = (
		<Group gap="xs" align="start" wrap="nowrap">
			<Badge variant="light" className="shrink-0">
				{ac.code}
			</Badge>
			<Text size="sm">{ac.text}</Text>
		</Group>
	)

	if (!editable) {
		return label
	}

	return (
		<Group gap="xs" align="start" wrap="nowrap">
			<div className="min-w-0 grow">
				<InlineEdit
					label={ac.code}
					value={ac.text}
					saving={edit.isPending}
					onSave={(text) => {
						edit.mutate({ kind: 'update-ac', acId: ac.id, text })
					}}
				>
					{label}
				</InlineEdit>
			</div>

			<Select
				size="xs"
				w={170}
				aria-label={`Tracer bullet for ${ac.code}`}
				placeholder="Unassigned"
				value={ac.sliceId}
				data={slices.map((slice) => ({
					value: slice.id,
					label: `${String(slice.ordinal)}. ${slice.title}`
				}))}
				onChange={(sliceId) => {
					edit.mutate({ kind: 'update-ac', acId: ac.id, sliceId })
				}}
			/>

			<ActionIcon
				variant="subtle"
				color="red"
				aria-label={`Delete ${ac.code}`}
				onClick={() => {
					edit.mutate({ kind: 'delete-ac', acId: ac.id })
				}}
			>
				<TrashIcon size={16} />
			</ActionIcon>
		</Group>
	)
}
