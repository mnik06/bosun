import { Alert, Button, PasswordInput, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'

import type { GithubPatConnection } from '~/entities/repository'
import { useRotateGithubPatConnection } from '~/features/connect-github-pat/api/use-connect-github-pat'
import { RotateGithubPatFormSchema, type RotateGithubPatForm } from '~/features/connect-github-pat/model/connect-github-pat-form'
import { AppModal } from '~/shared/ui'
import { toErrorMessage } from '~/shared/lib'

export function RotateGithubPatModal (props: { connection: GithubPatConnection, opened: boolean, onClose: () => void }) {
	const rotate = useRotateGithubPatConnection(props.connection.id)

	const form = useForm<RotateGithubPatForm>({
		mode: 'uncontrolled',
		initialValues: { pat: '' },
		validate: zod4Resolver(RotateGithubPatFormSchema)
	})

	const close = () => {
		rotate.reset()
		form.reset()
		props.onClose()
	}

	const submit = (values: RotateGithubPatForm) => {
		rotate.mutate(values.pat, { onSuccess: close })
	}

	return (
		<AppModal opened={props.opened} onClose={close} title={`Replace the token for ${props.connection.githubLogin}`} centered>
			<form onSubmit={form.onSubmit(submit)}>
				<Stack gap="md">
					<Text size="sm" c="dimmed">
						Validated the same way as connecting — bosun checks it can push to a repository before the old
						token is replaced. Nothing already attached changes. The new token must belong to{' '}
						{props.connection.githubLogin}.
					</Text>
					<PasswordInput
						label="New personal access token"
						data-autofocus
						key={form.key('pat')}
						{...form.getInputProps('pat')}
					/>

					{rotate.error === null ? null : (
						<Alert color="red" variant="light" title="Could not replace the token">
							{toErrorMessage(rotate.error, 'Unknown error')}
						</Alert>
					)}

					<Button type="submit" loading={rotate.isPending}>
						Replace token
					</Button>
				</Stack>
			</form>
		</AppModal>
	)
}
