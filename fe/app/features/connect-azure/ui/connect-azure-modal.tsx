import { Alert, Anchor, Button, List, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'

import { useConnectAzureOrganization } from '~/features/connect-azure/api/use-connect-azure'
import { ConnectAzureFormSchema, type ConnectAzureForm } from '~/features/connect-azure/model/connect-azure-form'
import { AppModal, QueryErrorAlert } from '~/shared/ui'

const PAT_DOCS_URL = 'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate'

export function ConnectAzureModal (props: { opened: boolean, onClose: () => void }) {
	const connect = useConnectAzureOrganization()

	const form = useForm<ConnectAzureForm>({
		mode: 'uncontrolled',
		initialValues: { organization: '', pat: '' },
		validate: zod4Resolver(ConnectAzureFormSchema)
	})

	const close = () => {
		connect.reset()
		form.reset()
		props.onClose()
	}

	const submit = (values: ConnectAzureForm) => {
		connect.mutate(values, { onSuccess: close })
	}

	return (
		<AppModal opened={props.opened} onClose={close} title="Connect an Azure DevOps organization" centered>
			<form onSubmit={form.onSubmit(submit)}>
				<Stack gap="md">
					<TextInput
						label="Organization"
						description="A bare name, a https://dev.azure.com/{org} URL, or a https://{org}.visualstudio.com URL"
						placeholder="my-organization"
						data-autofocus
						key={form.key('organization')}
						{...form.getInputProps('organization')}
					/>
					<PasswordInput
						label="Personal access token"
						key={form.key('pat')}
						{...form.getInputProps('pat')}
					/>

					<Alert color="blue" variant="light" title="Before you create the token">
						<List size="sm" spacing={4}>
							<List.Item>Scope it to this one organization — not &quot;All accessible organizations&quot;.</List.Item>
							<List.Item>
								Grant only the custom scopes bosun needs: <strong>Code (Read &amp; Write)</strong> and{' '}
								<strong>Service Hooks (Read, write, &amp; manage)</strong>.
							</List.Item>
							<List.Item>Pick the shortest expiry that is practical — bosun cannot renew it for you.</List.Item>
						</List>
						<Anchor href={PAT_DOCS_URL} target="_blank" rel="noreferrer" size="sm">
							Create a personal access token on Microsoft&apos;s docs
						</Anchor>
					</Alert>

					<Text size="xs" c="dimmed">
						Every machine attached to a repository from this organization receives this token and can use it
						to clone, fetch and push — it is long-lived, unlike GitHub&apos;s hour-long tokens, so treat its
						scope and expiry accordingly.
					</Text>

					{connect.error === null ? null : (
						<QueryErrorAlert title="Could not connect" error={connect.error} variant="light" />
					)}

					<Button type="submit" loading={connect.isPending}>
						Connect
					</Button>
				</Stack>
			</form>
		</AppModal>
	)
}
