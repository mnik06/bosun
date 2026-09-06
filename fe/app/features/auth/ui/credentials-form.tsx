import { Button, PasswordInput, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import type { ZodType } from 'zod'

import type { Credentials } from '~/features/auth/model/credentials'

export function CredentialsForm ({
	schema,
	submitLabel,
	passwordAutoComplete,
	pending,
	onSubmit
}: {
	schema: ZodType<Credentials>,
	submitLabel: string,
	passwordAutoComplete: 'current-password' | 'new-password',
	pending: boolean,
	onSubmit: (values: Credentials) => void
}) {
	const form = useForm<Credentials>({
		mode: 'uncontrolled',
		initialValues: { email: '', password: '' },
		validate: zod4Resolver(schema)
	})

	return (
		<form onSubmit={form.onSubmit(onSubmit)}>
			<Stack gap="md">
				<TextInput
					label="Email"
					type="email"
					autoComplete="email"
					placeholder="you@example.com"
					data-autofocus
					key={form.key('email')}
					{...form.getInputProps('email')}
				/>
				<PasswordInput
					label="Password"
					autoComplete={passwordAutoComplete}
					key={form.key('password')}
					{...form.getInputProps('password')}
				/>
				<Button type="submit" loading={pending}>
					{submitLabel}
				</Button>
			</Stack>
		</form>
	)
}
