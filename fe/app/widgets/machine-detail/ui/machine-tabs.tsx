import { Tabs, Tooltip } from '@mantine/core'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'

import type { Machine } from '~/entities/machine'

const TABS = ['setup', 'prompts', 'onboarding', 'inputs', 'config'] as const

type MachineTab = (typeof TABS)[number]

// Neither needs a repository attached: Setup exists before onboarding ever
// runs, and Prompts holds machine-level free text with nothing repository-
// specific in it.
const ALWAYS_ENABLED_TABS = ['setup', 'prompts'] as const

type AlwaysEnabledTab = (typeof ALWAYS_ENABLED_TABS)[number]

type RepositoryTab = Exclude<MachineTab, AlwaysEnabledTab>

const LABELS: Record<MachineTab, string> = {
	setup: 'Setup',
	prompts: 'Prompts',
	onboarding: 'Onboarding',
	inputs: 'Inputs',
	config: 'Config'
}

function isMachineTab (value: string | null): value is MachineTab {
	return TABS.some((tab) => tab === value)
}

function isAlwaysEnabled (value: MachineTab): value is AlwaysEnabledTab {
	return (ALWAYS_ENABLED_TABS as readonly MachineTab[]).includes(value)
}

export function MachineTabs ({
	machine,
	setup,
	prompts,
	panes
}: {
	machine: Machine,
	setup: ReactNode,
	prompts: ReactNode,
	panes: Record<RepositoryTab, ((machine: Machine) => ReactNode) | undefined>
}) {
	// In the URL rather than in state, so the checklist's "fill them in" can link
	// straight to a tab. Replaced, not pushed: a tab is not a place anybody expects
	// Back to return to.
	const [searchParams, setSearchParams] = useSearchParams()
	const attached = machine.repositoryId != null
	const requested = searchParams.get('tab')
	const enabled = (value: MachineTab) => isAlwaysEnabled(value) || attached
	const tab: MachineTab = isMachineTab(requested) && enabled(requested) ? requested : 'setup'

	return (
		<Tabs
			value={tab}
			keepMounted={false}
			onChange={(value) => {
				setSearchParams(value === null || value === 'setup' ? {} : { tab: value }, { replace: true })
			}}
		>
			<Tabs.List>
				{TABS.map((value) =>
					enabled(value) ? (
						<Tabs.Tab key={value} value={value}>
							{LABELS[value]}
						</Tabs.Tab>
					) : (
						<Tooltip key={value} label="Attach a repository first">
							<span className="inline-flex">
								<Tabs.Tab value={value} disabled>
									{LABELS[value]}
								</Tabs.Tab>
							</span>
						</Tooltip>
					)
				)}
			</Tabs.List>

			<Tabs.Panel value="setup" pt="md">
				{setup}
			</Tabs.Panel>

			<Tabs.Panel value="prompts" pt="md">
				{prompts}
			</Tabs.Panel>

			{TABS.filter((value): value is RepositoryTab => !isAlwaysEnabled(value)).map((value) => (
				<Tabs.Panel key={value} value={value} pt="md">
					{attached ? panes[value]?.(machine) : null}
				</Tabs.Panel>
			))}
		</Tabs>
	)
}
