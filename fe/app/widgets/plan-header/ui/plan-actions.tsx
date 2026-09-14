import { ActionIcon, Button, Menu } from '@mantine/core'
import { EllipsisVertical, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'

import type { PlanDetail, PlanState } from '~/entities/plan'
import { ApprovePlanButton } from '~/features/approve-plan'
import { BuildActionButton, BuildMenuItem } from '~/features/control-build'
import { DeletePlanMenuItem } from '~/features/delete-plan'
import { ShipFoundationMenuItem } from '~/features/ship-foundation'

type Detail = Pick<PlanDetail, 'plan' | 'build' | 'slices' | 'runs' | 'dependents'>

export function PrimaryAction ({ detail, state }: { detail: Detail, state: PlanState }) {
	const { build, plan } = detail

	if (state === 'needs_approval') {
		return <ApprovePlanButton planId={plan.id} disabled={plan.status !== 'ready'} />
	}

	if (build === null) {
		return null
	}

	switch (state) {
		case 'scheduled':
			return <BuildActionButton buildId={build.id} control="hold" />
		case 'held':
			return <BuildActionButton buildId={build.id} control="release" />
		case 'building':
		case 'integrating':
		case 'verifying':
			return <BuildActionButton buildId={build.id} control="stop" />
		case 'failed':
			return <BuildActionButton buildId={build.id} control="retry" />
		case 'in_review':
		case 'merged':
			return build.prUrl === null ? null : (
				<Button
					component="a"
					href={build.prUrl}
					target="_blank"
					rel="noreferrer"
					size="compact-sm"
					variant="light"
					leftSection={<ExternalLink size={14} />}
				>
					Open pull request
				</Button>
			)
		case 'drafting':
		case 'needs_you':
		case 'cancelled':
			return null
	}
}

// A foundation is worth shipping alone only once it has landed and something is
// stacked on it.
function foundationShippable (detail: Detail): boolean {
	return (
		detail.dependents.length > 0 &&
		detail.slices.some(
			(slice) =>
				slice.foundation &&
				detail.runs.some((run) => run.sliceId === slice.id && run.phase === null && run.status === 'done')
		)
	)
}

function menuItems (opts: { detail: Detail, state: PlanState }): ReactNode[] {
	const { build, plan } = opts.detail

	if (build === null || build.status === 'cancelled') {
		return ['drafting', 'needs_approval', 'failed'].includes(opts.state)
			? [<DeletePlanMenuItem key="discard" planId={plan.id} />]
			: []
	}

	const cancel = <BuildMenuItem key="cancel" buildId={build.id} control="cancel" />

	switch (opts.state) {
		case 'scheduled':
		case 'held':
			return [<BuildMenuItem key="front" buildId={build.id} control="front" />, cancel]
		case 'building':
		case 'integrating':
		case 'verifying':
		case 'needs_you':
		case 'failed':
			return [cancel]
		case 'in_review':
			return foundationShippable(opts.detail)
				? [<ShipFoundationMenuItem key="ship" buildId={build.id} planId={plan.id} />]
				: []
		case 'drafting':
		case 'needs_approval':
		case 'merged':
		case 'cancelled':
			return []
	}
}

export function PlanMenu ({ detail, state }: { detail: Detail, state: PlanState }) {
	const items = menuItems({ detail, state })

	if (items.length === 0) {
		return null
	}

	return (
		<Menu position="bottom-end" withinPortal>
			<Menu.Target>
				<ActionIcon variant="default" aria-label="More actions">
					<EllipsisVertical size={16} />
				</ActionIcon>
			</Menu.Target>
			<Menu.Dropdown>{items}</Menu.Dropdown>
		</Menu>
	)
}
