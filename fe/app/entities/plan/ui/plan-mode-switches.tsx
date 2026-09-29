import { Group, Switch, Tooltip } from '@mantine/core'
import { Info } from 'lucide-react'

export type PlanMode = 'verifyInUi' | 'auto' | 'afk'

export type PlanModes = Record<PlanMode, boolean>

const MODES: { mode: PlanMode, label: string, help: string }[] = [
	{
		mode: 'verifyInUi',
		label: 'Verify in the UI',
		help: 'The plan ends in a verify bullet that drives the finished feature through its interface and fixes what it finds. Off for work with no user-facing surface.'
	},
	{
		mode: 'auto',
		label: 'Auto-plan mode',
		help: 'Planning never waits for you: the grill answers its own questions with the option it recommended. Every question and answer still lands in the transcript.'
	},
	{
		mode: 'afk',
		label: 'AFK execution',
		help: 'Building never waits for you: bullets cannot ask a question, and the re-check after verify\'s fixes is skipped. Applies from the next bullet.'
	}
]

// Shared by the draft, where nothing is saved until the first message, and the
// running plan, where each flip is saved on its own.
export function PlanModeSwitches ({
	modes,
	locked = {},
	lockedReason,
	disabled = false,
	onChange
}: {
	modes: PlanModes
	locked?: Partial<Record<PlanMode, boolean>>
	lockedReason?: string
	disabled?: boolean
	onChange: (mode: PlanMode, value: boolean) => void
}) {
	return (
		<Group gap="md" wrap="nowrap">
			{MODES.map(({ mode, label, help }) => (
				<Group key={mode} gap={4} wrap="nowrap">
					<Switch
						size="xs"
						label={label}
						className="whitespace-nowrap"
						checked={modes[mode]}
						disabled={disabled || locked[mode] === true}
						onChange={(event) => {
							onChange(mode, event.currentTarget.checked)
						}}
					/>
					<Tooltip
						multiline
						w={280}
						withArrow
						events={{ hover: true, focus: true, touch: true }}
						label={locked[mode] === true && lockedReason !== undefined ? `${help} ${lockedReason}` : help}
					>
						<Info size={13} tabIndex={0} aria-label={`What ${label} means`} className="cursor-help opacity-60" />
					</Tooltip>
				</Group>
			))}
		</Group>
	)
}
