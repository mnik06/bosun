import { Alert, Anchor, Box, Group, ScrollArea, Select, Stack, Tabs, Text } from '@mantine/core'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { machineKind, useOnlineMachineOptions } from '~/entities/machine'
import { PlanModeSwitches, type PlanModes } from '~/entities/plan'
import { machinePickerLabel, useRepositoriesQuery } from '~/entities/repository'
import { useCreatePlan } from '~/features/create-plan/api/use-create-plan'
import { ChatComposer } from '~/shared/ui'

// A plan that does not exist yet, laid out like one that does. Nothing is saved
// until the first message: that message is the ticket, and sending it is what
// creates the plan and starts the grill — so leaving before then leaves nothing.
export function PlanDraft () {
	const navigate = useNavigate()
	const repositories = useRepositoriesQuery()
	const createPlan = useCreatePlan()
	const [machineId, setMachineId] = useState('')
	const [modes, setModes] = useState<PlanModes>({ verifyInUi: true, auto: false, afk: true })

	// Only online machines with something to read: a session runs in that
	// machine's checkout, and one enrolled with no repository attached has none.
	const { options } = useOnlineMachineOptions({
		filter: (machine) => machineKind(machine) !== 'unattached',
		label: (machine) => machinePickerLabel({ machine, repositories: repositories.data }),
		opened: true,
		machineId,
		onDefaultMachine: setMachineId
	})

	const noMachine = options.length === 0

	return (
		<div className="flex h-[var(--app-content-height)] min-h-0 flex-col gap-3 overflow-hidden">
			<div className="flex shrink-0 flex-col gap-2">
				<Group justify="space-between" gap="sm" wrap="nowrap">
					<Group gap="sm" wrap="nowrap" className="min-w-0">
						<Anchor component={Link} to="/plans" size="sm" className="shrink-0 whitespace-nowrap">
							← Plans
						</Anchor>
						<Text size="sm" fw={600} truncate className="min-w-0 grow">
							New plan
						</Text>
					</Group>

					<Stack gap="xs" align="end" className="shrink-0">
						<PlanModeSwitches
							modes={modes}
							disabled={createPlan.isPending}
							onChange={(mode, value) => {
								setModes((previous) => ({ ...previous, [mode]: value }))
							}}
						/>

						<Select
							size="xs"
							w={320}
							aria-label="Machine"
							placeholder="Pick an online machine"
							data={options}
							disabled={noMachine || createPlan.isPending}
							value={machineId === '' ? null : machineId}
							allowDeselect={false}
							onChange={(value) => {
								setMachineId(value ?? '')
							}}
						/>
					</Stack>
				</Group>

				<Group gap={6} wrap="nowrap" className="min-w-0">
					<Box w={8} h={8} className="shrink-0 rounded-full" bg="var(--mantine-color-gray-5)" />
					<Text size="xs" c="dimmed" truncate>
						Not started · nothing is saved until you send the ticket
					</Text>
				</Group>
			</div>

			<Tabs value="chat" className="flex min-h-0 grow flex-col">
				<Tabs.List mb="sm" className="shrink-0">
					<Tabs.Tab value="chat">Chat</Tabs.Tab>
				</Tabs.List>

				<div className="flex min-h-0 grow flex-col gap-3">
					<ScrollArea className="min-h-0 grow" type="auto">
						<Stack gap="md" pr="md">
							{noMachine ? (
								<Alert color="yellow" title="No machine is online">
									A planning session runs inside a machine&apos;s checkout. Bring one online first.
								</Alert>
							) : null}

							<Text size="sm" c="dimmed">
								Paste the ticket, the bug report or the half-formed idea below. Sending it starts the grill.
							</Text>
						</Stack>
					</ScrollArea>

					<div className="shrink-0 px-1 pb-1">
						<ChatComposer
							placeholder="Paste the ticket, the bug report, the half-formed idea…"
							disabled={noMachine || machineId === ''}
							sending={createPlan.isPending}
							onSend={async (message) =>
								createPlan.mutateAsync(
									{ form: { machineId, input: message.text, ...modes }, proposalId: null },
									{
										onSuccess: (plan) => {
											void navigate(`/plans/${plan.id}`, { replace: true })
										}
									}
								)
							}
						/>
					</div>
				</div>
			</Tabs>
		</div>
	)
}
