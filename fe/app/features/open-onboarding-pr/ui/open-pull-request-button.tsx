import { Anchor, Button, Group } from '@mantine/core'
import { GitPullRequest } from 'lucide-react'

import { useOpenPullRequest } from '~/features/open-onboarding-pr/api/use-open-pull-request'

// A button rather than a step of verify: bosun writes nothing into somebody's
// repository without a person choosing it.
export function OpenPullRequestButton ({ repositoryId }: { repositoryId: string }) {
	const open = useOpenPullRequest(repositoryId)

	return (
		<Group gap="sm">
			<Button
				size="xs"
				leftSection={<GitPullRequest size={14} />}
				loading={open.isPending}
				onClick={() => {
					open.mutate()
				}}
			>
				Open pull request
			</Button>

			{open.data === undefined ? null : (
				<Anchor href={open.data} target="_blank" rel="noreferrer" size="sm">
					{open.data}
				</Anchor>
			)}
		</Group>
	)
}
