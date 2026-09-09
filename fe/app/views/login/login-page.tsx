import { Stack, Text, Title } from '@mantine/core'

import { CredentialsForm, SignInSchema, useSignIn } from '~/features/auth'

export default function LoginPage () {
	const signIn = useSignIn()

	return (
		<Stack gap="lg">
			<Title order={3}>Log in</Title>

			<CredentialsForm
				schema={SignInSchema}
				submitLabel="Log in"
				passwordAutoComplete="current-password"
				pending={signIn.isPending}
				onSubmit={(values) => {
					signIn.mutate(values)
				}}
			/>

			<Text size="sm" c="dimmed">
				Accounts are created by a project leader. Ask yours for an email and password.
			</Text>
		</Stack>
	)
}
