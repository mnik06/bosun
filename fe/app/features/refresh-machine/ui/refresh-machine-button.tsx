import { ActionIcon, Tooltip } from '@mantine/core'
import { RefreshCw } from 'lucide-react'

// `blockedReason` rather than a bare boolean: refusing without saying why is the
// thing this exists to stop. A refresh is also how an agent upgrade is offered,
// and the agent declines to swap its own binary while a session is running — so
// the click used to look like it worked and silently did nothing.
export function RefreshMachineButton ({
	onRefresh,
	isRefreshing,
	blockedReason
}: {
	onRefresh: () => void,
	isRefreshing: boolean,
	blockedReason?: string | null
}) {
	return (
		<Tooltip label={blockedReason ?? 'Refresh the machine'} multiline w={blockedReason ? 240 : undefined}>
			<ActionIcon
				variant="filled"
				aria-label="Refresh machine"
				loading={isRefreshing}
				disabled={blockedReason != null}
				onClick={onRefresh}
			>
				<RefreshCw size={16} />
			</ActionIcon>
		</Tooltip>
	)
}
