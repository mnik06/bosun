import { ActionIcon, Badge, Card, Group, NumberInput, Stack, Text } from '@mantine/core'
import { TrashIcon } from 'lucide-react'

import type { Ac, Slice } from '~/entities/plan'
import { useEditArtifact } from '~/features/edit-artifact/api/use-edit-artifact'
import { AcRow } from '~/features/edit-artifact/ui/ac-row'
import { InlineEdit } from '~/shared/ui'

export function SliceCard ({
	planId,
	slice,
	slices,
	acs,
	editable
}: {
	planId: string
	slice: Slice
	slices: Slice[]
	acs: Ac[]
	editable: boolean
}) {
	const edit = useEditArtifact(planId)
	const owned = acs.filter((ac) => ac.sliceId === slice.id)

	const heading = (
		<Group gap="xs">
			<Text fw={600}>
				{slice.ordinal}. {slice.title}
			</Text>
			{slice.kind === 'verify' ? <Badge variant="light" color="grape">verify</Badge> : null}
		</Group>
	)

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" align="start" wrap="nowrap">
					<div className="min-w-0 grow">
						{editable ? (
							<InlineEdit
								label="Tracer bullet"
								value={slice.title}
								saving={edit.isPending}
								onSave={(title) => {
									edit.mutate({ kind: 'update-slice', sliceId: slice.id, title })
								}}
							>
								{heading}
							</InlineEdit>
						) : (
							heading
						)}
					</div>

					{editable ? (
						<Group gap="xs" wrap="nowrap">
							<NumberInput
								size="xs"
								w={70}
								min={1}
								aria-label={`Order of ${slice.title}`}
								value={slice.ordinal}
								onChange={(value) => {
									if (typeof value === 'number' && value !== slice.ordinal) {
										edit.mutate({ kind: 'update-slice', sliceId: slice.id, ordinal: value })
									}
								}}
							/>
							<ActionIcon
								variant="subtle"
								color="red"
								aria-label={`Delete ${slice.title}`}
								onClick={() => {
									edit.mutate({ kind: 'delete-slice', sliceId: slice.id })
								}}
							>
								<TrashIcon size={16} />
							</ActionIcon>
						</Group>
					) : null}
				</Group>

				{slice.bodyMd === null ? null : (
					<Text size="sm" c="dimmed" className="whitespace-pre-wrap">
						{slice.bodyMd}
					</Text>
				)}

				<Stack gap="xs">
					{owned.length === 0 ? (
						<Text size="xs" c="dimmed">
							No acceptance criteria yet.
						</Text>
					) : (
						owned.map((ac) => (
							<AcRow key={ac.id} planId={planId} ac={ac} slices={slices} editable={editable} />
						))
					)}
				</Stack>
			</Stack>
		</Card>
	)
}
