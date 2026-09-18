import { Badge, Divider, Group, Stack, Text } from '@mantine/core'

import { useProjectMembersQuery, useActiveProject } from '~/entities/project'
import { RunRow, type PlanDetail, type VerifyFinding } from '~/entities/plan'
import { StatusCard, type StatusCardBadge } from '~/shared/ui'
import { criterionVerdict } from '~/widgets/plan-verification/lib/verdict'

const SEVERITY_COLOR: Record<VerifyFinding['severity'], string> = { high: 'red', medium: 'orange', low: 'gray' }

const STATUS_COLOR: Record<VerifyFinding['status'], string> = {
	open: 'red',
	fixed: 'green',
	left: 'yellow',
	accepted: 'orange'
}

function FindingCard ({ finding, acceptedBy }: { finding: VerifyFinding, acceptedBy: string | null }) {
	const badges: StatusCardBadge[] = [
		{ label: finding.kind, variant: 'outline' },
		...(finding.acCode === null ? [] : [{ label: finding.acCode, variant: 'light' as const }]),
		{ label: finding.severity, color: SEVERITY_COLOR[finding.severity], variant: 'light' },
		{ label: finding.status, color: STATUS_COLOR[finding.status], variant: 'filled' }
	]

	return (
		<StatusCard
			badges={badges}
			body={finding.reproduction}
			note={finding.note}
			footer={acceptedBy === null ? null : `Accepted by ${acceptedBy}`}
		/>
	)
}

export function PlanVerification ({ detail }: { detail: PlanDetail }) {
	const { activeProject } = useActiveProject()
	const members = useProjectMembersQuery(activeProject?.id ?? null)
	const emailOf = (userId: string | null): string | null =>
		userId === null ? null : (members.data?.find((member) => member.userId === userId)?.email ?? 'a member')
	const sessions = detail.runs
		.filter((run) => run.phase !== null)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

	return (
		<Stack gap="lg">
			<Divider label="Criteria" labelPosition="left" />
			<Stack gap="sm">
				{detail.acs.map((ac) => {
					const verdict = criterionVerdict({ ac, findings: detail.findings })

					return (
						<Group key={ac.id} gap="sm" align="start" wrap="nowrap">
							<Badge variant="light" className="shrink-0">
								{ac.code}
							</Badge>
							<Stack gap={2} className="min-w-0 grow">
								<Text size="sm">{ac.text}</Text>
								{verdict.detail === null ? null : (
									<Text size="xs" c="dimmed" className="whitespace-pre-wrap">
										{verdict.detail}
									</Text>
								)}
							</Stack>
							<Badge color={verdict.color} variant="light" className="shrink-0">
								{verdict.label}
							</Badge>
						</Group>
					)
				})}
			</Stack>

			<Divider label="Findings" labelPosition="left" />
			{detail.findings.length === 0 ? (
				<Text size="sm" c="dimmed">
					No findings recorded.
				</Text>
			) : (
				<Stack gap="sm">
					{detail.findings.map((finding) => (
						<FindingCard key={finding.id} finding={finding} acceptedBy={emailOf(finding.acceptedByUserId)} />
					))}
				</Stack>
			)}

			<Divider label="Drive, fix and re-check" labelPosition="left" />
			<Stack gap="sm">
				{sessions.map((run) => (
					<RunRow key={run.id} run={run} activity={undefined} />
				))}
			</Stack>
		</Stack>
	)
}
