import { Button, Menu } from '@mantine/core'
import { ArrowUpToLine, Hand, Play, RotateCcw, Square, X, type LucideIcon } from 'lucide-react'

import { useControlBuild, type BuildAction } from '~/features/control-build/api/use-control-build'
import { confirmAction } from '~/shared/lib'

// Stop is a hold on a running build, named for what the person sees happen.
export type BuildControl = Exclude<BuildAction, 'fix-again' | 'accept-gaps'> | 'stop'

interface ControlSpec {
	action: BuildAction
	label: string
	icon: LucideIcon
	color?: string
	confirm?: { title: string, body: string, label: string }
}

const CONTROLS: Record<BuildControl, ControlSpec> = {
	hold: { action: 'hold', label: 'Hold', icon: Hand },
	stop: {
		action: 'hold',
		label: 'Stop',
		icon: Square,
		color: 'yellow',
		confirm: {
			title: 'Stop this plan?',
			body: 'The running session is cancelled and its bullet goes back to pending. The branch and every committed bullet stay, and the plan is held — Release continues from the last commit.',
			label: 'Stop and hold'
		}
	},
	release: { action: 'release', label: 'Release', icon: Play },
	retry: { action: 'retry', label: 'Retry', icon: RotateCcw },
	front: { action: 'front', label: 'Move to front', icon: ArrowUpToLine },
	cancel: {
		action: 'cancel',
		label: 'Cancel',
		icon: X,
		color: 'red',
		confirm: {
			title: 'Cancel this build?',
			body: 'The build leaves the line and its worktree is removed. Its branch is kept for inspection; approving the plan again starts a new build.',
			label: 'Cancel the build'
		}
	}
}

function withConfirm (spec: ControlSpec, run: () => void): () => void {
	const { confirm } = spec

	if (confirm === undefined) {
		return run
	}

	return () => {
		confirmAction({
			title: confirm.title,
			body: confirm.body,
			confirmLabel: confirm.label,
			cancelLabel: 'Keep it',
			color: spec.color ?? 'blue',
			onConfirm: run
		})
	}
}

export function BuildActionButton ({ buildId, control }: { buildId: string, control: BuildControl }) {
	const mutation = useControlBuild(buildId)
	const spec = CONTROLS[control]
	const Icon = spec.icon

	return (
		<Button
			size="compact-sm"
			variant={control === 'release' || control === 'retry' ? 'filled' : 'light'}
			color={spec.color ?? 'blue'}
			leftSection={<Icon size={14} />}
			loading={mutation.isPending}
			onClick={withConfirm(spec, () => {
				mutation.mutate(spec.action)
			})}
		>
			{spec.label}
		</Button>
	)
}

export function BuildMenuItem ({ buildId, control }: { buildId: string, control: BuildControl }) {
	const mutation = useControlBuild(buildId)
	const spec = CONTROLS[control]
	const Icon = spec.icon

	return (
		<Menu.Item
			{...(spec.color === undefined ? {} : { color: spec.color })}
			leftSection={<Icon size={14} />}
			disabled={mutation.isPending}
			onClick={withConfirm(spec, () => {
				mutation.mutate(spec.action)
			})}
		>
			{spec.label}
		</Menu.Item>
	)
}
