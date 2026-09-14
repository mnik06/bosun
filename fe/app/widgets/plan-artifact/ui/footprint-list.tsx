import { Code, Group, Stack, Text } from '@mantine/core'

import type { Footprint } from '~/entities/plan'

function Row ({ op, label, detail }: { op: string, label: string, detail?: string | undefined }) {
	return (
		<Group gap="xs" align="start" wrap="nowrap">
			<Text size="xs" c="dimmed" w={96} className="shrink-0">
				{op.replace('_', ' ')}
			</Text>
			<Stack gap={0} className="min-w-0">
				<Text size="xs" className="font-mono break-all">
					{label}
				</Text>
				{detail === undefined || detail === '' ? null : (
					<Code block className="text-xs">
						{detail}
					</Code>
				)}
			</Stack>
		</Group>
	)
}

// What this bullet declared it changes. The line compares plans over exactly this,
// so it is shown as written rather than summarised.
export function FootprintList ({ footprint }: { footprint: Footprint }) {
	const empty =
		footprint.schema.length + footprint.contracts.length + footprint.modules.length + footprint.consumes.length === 0

	if (empty) {
		return null
	}

	return (
		<Stack gap={4}>
			<Text size="xs" c="dimmed">
				Footprint
			</Text>
			{footprint.schema.map((change) => (
				<Row
					key={`s-${change.op}-${change.table}-${change.column ?? ''}`}
					op={change.op}
					label={change.column === undefined ? change.table : `${change.table}.${change.column}`}
					detail={change.definition}
				/>
			))}
			{footprint.contracts.map((change) => (
				<Row
					key={`c-${change.op}-${change.method}-${change.path}`}
					op={`${change.op} api`}
					label={`${change.method.toUpperCase()} ${change.path}`}
					detail={change.shape}
				/>
			))}
			{footprint.modules.map((change) => (
				<Row
					key={`m-${change.op}-${change.path}-${change.symbol ?? ''}`}
					op={`${change.op} module`}
					label={change.symbol === undefined ? change.path : `${change.path} · ${change.symbol}`}
				/>
			))}
			{footprint.consumes.map((piece) => (
				<Row key={`u-${String(piece.planNumber)}-${piece.item}`} op="uses" label={`#${String(piece.planNumber)} ${piece.item}`} />
			))}
		</Stack>
	)
}
