import { Anchor, Card, Divider, Group, Loader, Stack, Text, ThemeIcon } from '@mantine/core'
import { Check, CircleDashed, Minus, X } from 'lucide-react'
import { Link } from 'react-router'

import type { Machine } from '~/entities/machine'
import { AttachRepository } from '~/features/attach-repository'
import { StartOnboardingButton } from '~/features/start-onboarding'
import { useKeyFingerprint } from '~/shared/hooks'
import { setupProgress, type ChecklistRow } from '~/widgets/setup-checklist/lib/checklist'
import { useChecklist } from '~/widgets/setup-checklist/model/use-checklist'
import { InlineCommand } from '~/widgets/setup-checklist/ui/inline-command'

function StateIcon ({ state }: { state: ChecklistRow['state'] }) {
	switch (state) {
		case 'done':
			return <ThemeIcon color="green" size={20} radius="xl"><Check size={12} /></ThemeIcon>
		case 'failed':
			return <ThemeIcon color="red" size={20} radius="xl"><X size={12} /></ThemeIcon>
		case 'running':
			return <Loader size={18} />
		case 'todo':
			return <ThemeIcon color="yellow" variant="light" size={20} radius="xl"><CircleDashed size={12} /></ThemeIcon>
		case 'blocked':
			return <ThemeIcon color="gray" variant="light" size={20} radius="xl"><Minus size={12} /></ThemeIcon>
	}
}

function RowAction ({ row, machine }: { row: ChecklistRow, machine: Machine }) {
	switch (row.action) {
		case 'start-agent':
			return <InlineCommand command="systemctl --user start bosun-agent" />
		case 'run-setup':
			return <InlineCommand command="bosun-agent setup" />
		case 'attach-repository':
			return <AttachRepository machine={machine} />
		case 'start-onboarding':
			return <StartOnboardingButton machine={machine} phase="discover" again={row.state === 'failed'} />
		case 'run-verify':
			return <StartOnboardingButton machine={machine} phase="verify" again={row.state === 'failed'} />
		case 'choose-base-branch':
			return (
				<Anchor component={Link} to="?tab=onboarding" replace size="sm">
					Review it on Onboarding
				</Anchor>
			)
		case 'provide-inputs':
			return (
				<Anchor component={Link} to="?tab=inputs" replace size="sm">
					Fill them in on Inputs
				</Anchor>
			)
		case null:
			return null
	}
}

function Fingerprint ({ publicKey }: { publicKey: string | null | undefined }) {
	const fingerprint = useKeyFingerprint(publicKey)

	if (fingerprint === null) {
		return (
			<Text size="xs" c="dimmed">
				No machine key reported yet — the agent sends one when it connects.
			</Text>
		)
	}

	return (
		<Stack gap={2}>
			<Text size="xs" className="font-mono break-all">
				{fingerprint}
			</Text>
			<Text size="xs" c="dimmed">
				The machine key values typed here are sealed to. It should match what bosun-agent setup
				printed on the box — if it does not, do not type anything in.
			</Text>
		</Stack>
	)
}

export function SetupChecklist ({ machine }: { machine: Machine }) {
	const rows = useChecklist(machine)
	const progress = setupProgress(rows)

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" gap="sm">
					<Text fw={600}>Setup</Text>
					<Text size="sm" c="dimmed">
						{progress.done}/{progress.total}
					</Text>
				</Group>

				{rows.map((row) => (
					<Group key={row.id} justify="space-between" align="center" gap="sm" wrap="wrap">
						<Group gap="sm" wrap="nowrap" className="min-w-0">
							<StateIcon state={row.state} />
							<Stack gap={0} className="min-w-0">
								<Text size="sm" fw={500}>
									{row.label}
								</Text>
								<Text size="xs" c="dimmed" className="break-words">
									{row.detail}
								</Text>
							</Stack>
						</Group>

						<RowAction row={row} machine={machine} />
					</Group>
				))}

				<Divider />

				<Fingerprint publicKey={machine.publicKey} />
			</Stack>
		</Card>
	)
}
