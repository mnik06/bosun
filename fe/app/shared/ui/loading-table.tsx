import { Loader, Table } from '@mantine/core'
import type { ReactNode } from 'react'

export function LoadingTable ({
	loading,
	minWidth = 480,
	head,
	children
}: {
	loading: boolean,
	minWidth?: number,
	head: ReactNode,
	children: ReactNode
}) {
	if (loading) {
		return <Loader size="sm" />
	}

	return (
		<Table.ScrollContainer minWidth={minWidth}>
			<Table highlightOnHover>
				<Table.Thead>{head}</Table.Thead>
				<Table.Tbody>{children}</Table.Tbody>
			</Table>
		</Table.ScrollContainer>
	)
}
