import { Alert, Button, Code, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { refreshAfterBuild, type OverlapChoice, type OverlapDecisionView } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

function choiceLabel (opts: { choice: OverlapChoice, provider: number }): string {
	switch (opts.choice) {
		case 'use_theirs':
			return `Use #${String(opts.provider)}'s definition`
		case 'change_theirs':
			return `Change #${String(opts.provider)}'s to this one`
		case 'rename':
			return 'Rename this plan\'s'
	}
}

function Decision ({ decision }: { decision: OverlapDecisionView }) {
	const queryClient = useQueryClient()
	const deciding = (choice: OverlapChoice): boolean => decide.isPending && decide.variables === choice
	const decide = useMutation({
		mutationFn: async (chosen: OverlapChoice) => {
			await apiClient.post(`/overlap-decisions/${decision.id}`, { chosen })
		},
		onSuccess: () => {
			refreshAfterBuild({ queryClient, planId: decision.planId })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not record the decision', error })
		}
	})

	return (
		<Stack gap="xs">
			<Text size="sm">
				This plan and <strong>#{decision.providerNumber} {decision.providerTitle ?? ''}</strong> both
				create <Code>{decision.item.label}</Code>, with different definitions.
				#{decision.providerNumber} was approved first, so its definition stands unless you change it.
			</Text>

			<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
				<Stack gap={2}>
					<Text size="xs" c="dimmed">
						This plan
					</Text>
					<Code block>{decision.item.ours || '—'}</Code>
				</Stack>
				<Stack gap={2}>
					<Text size="xs" c="dimmed">
						#{decision.providerNumber}
					</Text>
					<Code block>{decision.item.theirs || '—'}</Code>
				</Stack>
			</SimpleGrid>

			<Group gap="xs">
				{decision.options.map((choice) => (
					<Button
						key={choice}
						size="compact-sm"
						variant={choice === 'use_theirs' ? 'filled' : 'light'}
						loading={deciding(choice)}
						disabled={decide.isPending}
						onClick={() => {
							decide.mutate(choice)
						}}
					>
						{choiceLabel({ choice, provider: decision.providerNumber })}
					</Button>
				))}
			</Group>
		</Stack>
	)
}

// The decision belongs to the plan being approved, not to the one it collides
// with — which is why it is answered here and nowhere else.
export function OverlapDecisionPanel ({ decisions }: { decisions: OverlapDecisionView[] }) {
	const open = decisions.filter((decision) => decision.chosen === null)

	if (open.length === 0) {
		return null
	}

	return (
		<Alert color="orange" variant="light" title="An overlap needs a decision">
			<Stack gap="lg">
				{open.map((decision) => (
					<Decision key={decision.id} decision={decision} />
				))}
			</Stack>
		</Alert>
	)
}
