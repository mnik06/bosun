import { Alert, Button, PasswordInput, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'

import type { AzureConnection } from '~/entities/repository'
import { useRotateAzureConnection } from '~/features/connect-azure/api/use-connect-azure'
import { RotateAzureFormSchema, type RotateAzureForm } from '~/features/connect-azure/model/connect-azure-form'
import { AppModal } from '~/shared/ui'
import { toErrorMessage } from '~/shared/lib'

export function RotateAzureModal (props: { connection: AzureConnection, opened: boolean, onClose: () => void }) {
	const rotate = useRotateAzureConnection(props.connection.id)

	const form = useForm<RotateAzureForm>({
		mode: 'uncontrolled',
		initialValues: { pat: '' },
		validate: zod4Resolver(RotateAzureFormSchema)
	})

	const close = () => {
		rotate.reset()
		form.reset()
		props.onClose()
	}

	const submit = (values: RotateAzureForm) => {
		rotate.mutate(values.pat, { onSuccess: close })
	}

	return (
		<AppModal opened={props.opened} onClose={close} title={`Replace the token for ${props.connection.organization}`} centered>
			<form onSubmit={form.onSubmit(submit)}>
				<Stack gap="md">
					<Text size="sm" c="dimmed">
						Validated the same way as connecting: bosun checks it can list this organization&apos;s
						repositories before the old token is replaced. Nothing already attached changes.
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
