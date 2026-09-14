import { Badge } from '@mantine/core'

import { machineKind, type Machine } from '~/entities/machine'
import { setupProgress } from '~/widgets/setup-checklist/lib/checklist'
import { useChecklist } from '~/widgets/setup-checklist/model/use-checklist'

export function SetupProgressBadge ({ machine }: { machine: Machine }) {
	const rows = useChecklist(machine)
	const kind = machineKind(machine)
	const progress = setupProgress(rows)

	if ((kind !== 'unattached' && kind !== 'repository') || progress.done === progress.total) {
		return null
	}

	return (
		<Badge variant="light" color="yellow" size="sm">
			setup {progress.done}/{progress.total}
		</Badge>
	)
}
