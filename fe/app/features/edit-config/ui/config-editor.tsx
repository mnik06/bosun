import { Alert, Button, Group, List, Stack, Text, Textarea } from '@mantine/core'
import { useState, type ReactNode } from 'react'

import { useSaveConfig } from '~/features/edit-config/api/use-save-config'
import { configIssues } from '~/features/edit-config/lib/config-issues'

const PLACEHOLDER = `Toolchain:
- Node 24.15.0
- pnpm 11.8.0

Install:
- be: pnpm install
- fe: pnpm install

Apps:
be:
- Migrate: pnpm db:migrate
- Start: pnpm dev
- Test: pnpm test
fe:
- Start: pnpm dev
- Test: pnpm test

Feedback loops:
- be: pnpm lint && pnpm test
- fe: pnpm lint && pnpm test

Test accounts:
- admin: TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD`

export function ConfigEditor ({
	repositoryId,
	initialText,
	actions
}: {
	repositoryId: string,
	initialText: string,
	actions?: ReactNode
}) {
	const [text, setText] = useState(initialText)
	const save = useSaveConfig(repositoryId)
	const issues = save.isError ? configIssues(save.error) : null
	const changed = text !== initialText

	return (
		<Stack gap="sm">
			<Textarea
				aria-label="Project config"
				description="Facts about the code — how it installs, starts and proves itself. Never secrets, never which database."
				placeholder={PLACEHOLDER}
				autosize
				minRows={12}
				maxRows={40}
				spellCheck={false}
				classNames={{ input: 'font-mono text-xs' }}
				value={text}
				onChange={(event) => {
					setText(event.currentTarget.value)
				}}
			/>

			{issues === null || issues.length === 0 ? null : (
				<Alert color="red" variant="light" title="The config did not validate">
					<List size="sm" spacing={2}>
						{issues.map((issue) => (
							<List.Item key={`${issue.line ?? 'doc'}:${issue.message}`}>
								{issue.line === null ? null : (
									<Text component="span" size="sm" className="font-mono">
										Line {issue.line}:
									</Text>
								)}{' '}
								{issue.message}
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
							setText(initialText)
							save.reset()
						}}
					>
						Discard changes
					</Button>
					<Button
						size="xs"
						loading={save.isPending}
						disabled={!changed || text.trim() === ''}
						onClick={() => {
							save.mutate(text)
						}}
					>
						Save
					</Button>
				</Group>
			</Group>
		</Stack>
	)
}
