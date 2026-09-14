import { Anchor, Badge, Card, Divider, Group, Stack, Text } from '@mantine/core'
import { Check, Hourglass } from 'lucide-react'
import { Link } from 'react-router'

import type { DependencyView, PlanAmendment } from '~/entities/plan'
import { RunAnywayButton } from '~/features/override-dependency'

function dependencyLine (dependency: DependencyView): string {
	const provider = `#${String(dependency.providerNumber)}`

	if (dependency.providerSliceOrdinal === null) {
		return `needs all of ${provider}`
	}

	if (dependency.providerSliceOrdinal === 1) {
		return `uses ${provider}'s foundation`
	}

	const title = dependency.providerSliceTitle === null ? '' : ` — ${dependency.providerSliceTitle}`

	return `uses bullet ${String(dependency.providerSliceOrdinal)} of ${provider}${title}`
}

function DependencyRow ({ dependency, buildId }: { dependency: DependencyView, buildId: string | null }) {
	const overridden = dependency.overriddenAt !== null

	return (
		<Group gap="xs" align="start" wrap="nowrap">
			{dependency.released || overridden ? (
				<Check size={14} className="mt-1 shrink-0 text-[var(--mantine-color-green-6)]" />
			) : (
				<Hourglass size={14} className="mt-1 shrink-0 text-[var(--mantine-color-orange-6)]" />
			)}

			<Stack gap={0} className="min-w-0 grow">
				<Group gap="xs">
					<Anchor component={Link} to={`/plans/${dependency.providerPlanId}`} size="sm">
						{dependencyLine(dependency)}
					</Anchor>
					<Badge size="xs" variant="outline" color="gray">
						{dependency.source}
					</Badge>
					{overridden ? (
						<Badge size="xs" variant="light" color="orange">
							run anyway
						</Badge>
					) : null}
				</Group>
				<Text size="xs" c="dimmed">
					{dependency.reason}
				</Text>
			</Stack>

			{buildId === null || dependency.released || overridden ? null : (
				<RunAnywayButton
					buildId={buildId}
					dependencyId={dependency.id}
					planId={dependency.planId}
					provider={`#${String(dependency.providerNumber)}`}
				/>
			)}
		</Group>
	)
}

// Amendments are what bosun changed to make this plan fit the others. They do not
// clear approval, because what the plan delivers is unchanged — so they are shown
// here, where somebody who approved it can still see them.
export function PlanDependencies ({
	dependencies,
	amendments,
	buildId
}: {
	dependencies: DependencyView[],
	amendments: PlanAmendment[],
	buildId: string | null
}) {
	if (dependencies.length === 0 && amendments.length === 0) {
		return null
	}

	return (
		<>
			<Divider label="Dependencies" labelPosition="left" />

			<Card withBorder padding="md" radius="md">
				<Stack gap="sm">
					{dependencies.length === 0 ? (
						<Text size="sm" c="dimmed">
							Waits on no other plan.
						</Text>
					) : (
						dependencies.map((dependency) => (
							<DependencyRow key={dependency.id} dependency={dependency} buildId={buildId} />
						))
					)}

					{amendments.map((amendment) => (
						<Text key={amendment.id} size="sm">
							<Badge size="xs" variant="light" color="cyan" mr={6}>
								amended
							</Badge>
							{amendment.text}
						</Text>
					))}
				</Stack>
			</Card>
		</>
	)
}
