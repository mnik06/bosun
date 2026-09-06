import { Anchor, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'

import { CredentialsForm, SignUpSchema, useSignUp } from '~/features/auth'

export default function SignupPage () {
	const signUp = useSignUp()

	return (
		<Stack gap="lg">
			<Title order={3}>Create an account</Title>

			<CredentialsForm
				schema={SignUpSchema}
				submitLabel="Sign up"
				passwordAutoComplete="new-password"
				pending={signUp.isPending}
				onSubmit={(values) => {
					signUp.mutate(values)
				}}
			/>

			<Text size="sm" c="dimmed">
				Already have one?{' '}
				<Anchor component={Link} to="/login" size="sm">
					Log in
				</Anchor>
			</Text>
		</Stack>
	)
}
