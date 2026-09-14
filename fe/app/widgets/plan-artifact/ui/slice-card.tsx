import { Badge, Card, Group, Stack, Text } from '@mantine/core'

import type { Ac, Slice } from '~/entities/plan'
import { MarkdownBlock } from '~/shared/ui'
import { FootprintList } from '~/widgets/plan-artifact/ui/footprint-list'

const VERIFY_JOB =
	'Drives every acceptance criterion through the running product, fixes what it finds in a session of its own, and drives the repaired criteria again. It builds nothing of its own.'

export function SliceCard ({ slice, acs }: { slice: Slice, acs: Ac[] }) {
	const claimed = acs.filter((ac) => ac.sliceId === slice.id)

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group gap="xs">
					<Text fw={600}>
						{slice.ordinal}. {slice.title}
					</Text>
					{slice.kind === 'verify' ? (
						<Badge variant="light" color="grape">
							verify
						</Badge>
					) : null}
					{slice.foundation ? (
						<Badge variant="light" color="teal">
							foundation
						</Badge>
					) : null}
				</Group>

				{slice.kind === 'verify' ? (
					<Text size="sm" c="dimmed">
						{VERIFY_JOB}
					</Text>
				) : (
					<>
						{slice.bodyMd === null ? null : <MarkdownBlock source={slice.bodyMd} />}

						{claimed.length === 0 ? null : (
							<Group gap="xs">
								{claimed.map((ac) => (
									<Badge key={ac.id} size="sm" variant="outline">
										{ac.code}
									</Badge>
								))}
							</Group>
						)}

						<FootprintList footprint={slice.footprint} />
					</>
				)}
			</Stack>
		</Card>
	)
}
