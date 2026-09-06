import { Anchor, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'

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
				No account yet?{' '}
				<Anchor component={Link} to="/signup" size="sm">
					Sign up
				</Anchor>
			</Text>
		</Stack>
	)
}
