import { Alert, Button, Group, List, Stack, Text, Textarea } from '@mantine/core'
import { useState } from 'react'

import type { Repository } from '~/entities/repository'
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

export function ConfigDraftEditor ({ repository }: { repository: Repository }) {
	const [yaml, setYaml] = useState(repository.configDraft ?? '')
	const save = useSaveConfigDraft(repository.id)
	const issues = save.isError ? configIssues(save.error) : null

	return (
		<Stack gap="sm">
			{repository.configOnDefault ? (
				<Text size="xs" c="dimmed">
					{repository.defaultBranch} already has .bosun/project.yaml, and a session always uses the
					file in its own tree. This draft only applies to a branch that has no file.
				</Text>
			) : null}

			<Textarea
				label="Config draft"
				description="Facts about the code — how it installs, starts and proves itself. Never secrets, never which database."
				placeholder={PLACEHOLDER}
				autosize
				minRows={8}
				maxRows={30}
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

			<Group justify="flex-end">
				<Button
					size="xs"
					loading={save.isPending}
					disabled={yaml.trim() === ''}
					onClick={() => {
						save.mutate(yaml)
					}}
				>
					Save draft
				</Button>
			</Group>
		</Stack>
	)
}
