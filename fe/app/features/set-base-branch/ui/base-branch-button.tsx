import { Button } from '@mantine/core'
import { GitBranch } from 'lucide-react'

import { useSaveBaseBranch } from '~/features/set-base-branch/api/use-save-base-branch'

export function BaseBranchButton ({
	repositoryId,
	branch,
	label,
	variant = 'filled'
}: {
	repositoryId: string
	branch: string | null
	label: string
	variant?: 'filled' | 'light' | 'subtle'
}) {
	const save = useSaveBaseBranch(repositoryId)

	return (
		<Button
			size="xs"
			variant={variant}
			leftSection={<GitBranch size={14} />}
			loading={save.isPending}
			onClick={() => {
				save.mutate(branch)
			}}
		>
			{label}
		</Button>
	)
}
