import { Anchor, Menu } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GitPullRequestArrow } from 'lucide-react'
import { z } from 'zod'

import { refreshAfterBuild } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const ShipRespSchema = z.object({ prUrl: z.string() })

// A pull request of the foundation's commits alone, so the plans stacked on it are
// not held by a slow review of the rest of this one.
export function ShipFoundationMenuItem ({ buildId, planId }: { buildId: string, planId: string }) {
	const queryClient = useQueryClient()
	const ship = useMutation({
		mutationFn: async () => {
			const { data } = await apiClient.post<unknown>(`/builds/${buildId}/ship-foundation`)

			return ShipRespSchema.parse(data).prUrl
		},
		onSuccess: (prUrl) => {
			refreshAfterBuild({ queryClient, planId })
			notifications.show({
				color: 'green',
				title: 'Foundation pull request opened',
				message: (
					<Anchor href={prUrl} target="_blank" rel="noreferrer" size="sm">
						{prUrl}
					</Anchor>
				)
			})
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not ship the foundation', error })
		}
	})

	return (
		<Menu.Item
			leftSection={<GitPullRequestArrow size={14} />}
			disabled={ship.isPending}
			onClick={() => {
				ship.mutate()
			}}
		>
			Ship foundation alone
		</Menu.Item>
	)
}
