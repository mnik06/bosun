import { Alert, Button, Group, List, Stack, Text, Textarea } from '@mantine/core'
import { useState, type ReactNode } from 'react'

import { useSaveConfigDraft } from '~/features/edit-config-draft/api/use-save-config-draft'
import { configIssues } from '~/features/edit-config-draft/lib/config-issues'

const PLACEHOLDER = `version: 1

toolchain:
  node: "24.15.0"
  packageManager: "pnpm@11.8.0"

setup:
  - name: install
    run: pnpm install --frozen-lockfile
    rerunWhen: [pnpm-lock.yaml]

apps:
  web:
    start: pnpm dev --port {port}
    ready: "{url.web}"`

export function ConfigDraftEditor ({
	repositoryId,
	initialYaml,
	actions
}: {
	repositoryId: string,
	initialYaml: string,
	actions?: ReactNode
}) {
	const [yaml, setYaml] = useState(initialYaml)
	const save = useSaveConfigDraft(repositoryId)
	const issues = save.isError ? configIssues(save.error) : null
	const changed = yaml !== initialYaml

	return (
		<Stack gap="sm">
			<Textarea
				aria-label="project.yaml"
				description="Facts about the code — how it installs, starts and proves itself. Never secrets, never which database."
				placeholder={PLACEHOLDER}
				autosize
				minRows={12}
				maxRows={40}
				spellCheck={false}
				classNames={{ input: 'font-mono text-xs' }}
				value={yaml}
				onChange={(event) => {
					setYaml(event.currentTarget.value)
				}}
			/>

			{issues === null || issues.length === 0 ? null : (
				<Alert color="red" variant="light" title="The draft did not validate">
					<List size="sm" spacing={2}>
						{issues.map((issue) => (
							<List.Item key={`${issue.path}:${issue.message}`}>
								<Text component="span" size="sm" className="font-mono">
									{issue.path}
								</Text>{' '}
								— {issue.message}
							</List.Item>
						))}
					</List>
				</Alert>
			)}

			<Group justify="space-between" gap="sm">
				<Group gap="sm">{actions}</Group>

				<Group gap="sm">
					<Button
						variant="default"
						size="xs"
						disabled={!changed}
						onClick={() => {
							setYaml(initialYaml)
							save.reset()
						}}
					>
						Discard draft changes
					</Button>
					<Button
						size="xs"
						loading={save.isPending}
						disabled={!changed || yaml.trim() === ''}
						onClick={() => {
							save.mutate(yaml)
						}}
					>
						Save draft
					</Button>
				</Group>
			</Group>
		</Stack>
	)
}
