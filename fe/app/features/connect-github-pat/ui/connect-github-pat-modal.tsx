import { Alert, Anchor, Button, Checkbox, List, PasswordInput, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'

import { useConnectGithubPatConnection } from '~/features/connect-github-pat/api/use-connect-github-pat'
import { errorSsoUrl } from '~/features/connect-github-pat/lib/error-sso-url'
import { ConnectGithubPatFormSchema, detectGithubTokenKind, type ConnectGithubPatForm } from '~/features/connect-github-pat/model/connect-github-pat-form'
import { AppModal, QueryErrorAlert } from '~/shared/ui'

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'
const CLASSIC_TOKEN_URL = 'https://github.com/settings/tokens/new'

export function ConnectGithubPatModal (props: { opened: boolean, onClose: () => void }) {
	const connect = useConnectGithubPatConnection()

	const form = useForm<ConnectGithubPatForm>({
		mode: 'controlled',
		initialValues: { pat: '', confirmedClassicScope: false },
		validate: zod4Resolver(ConnectGithubPatFormSchema)
	})

	const kind = detectGithubTokenKind(form.values.pat)
	const isClassic = form.values.pat.length > 0 && kind === 'classic'
	const ssoUrl = errorSsoUrl(connect.error)
	const kindLabel = kind === 'fine_grained' ? 'fine-grained' : 'classic'
	const patDescription = form.values.pat.length === 0 ? undefined : `Detected as a ${kindLabel} token`
	const classicUnconfirmed: boolean = isClassic && !form.values.confirmedClassicScope

	const close = () => {
		connect.reset()
		form.reset()
		props.onClose()
	}

	const submit = (values: ConnectGithubPatForm) => {
		connect.mutate(values.pat)
	}

	// Stays open on success (AC-64): the person reads which account was connected
	// before it closes, rather than the form vanishing the instant it lands.
	if (connect.isSuccess) {
		return (
			<AppModal opened={props.opened} onClose={close} title="Connected" centered>
				<Stack gap="md">
					<Alert color="green" variant="light" title="Token connected">
						Signed in as {connect.data.githubLogin}. It now appears in the repository picker.
					</Alert>
					<Button onClick={close}>Done</Button>
				</Stack>
			</AppModal>
		)
	}

	return (
		<AppModal opened={props.opened} onClose={close} title="Connect with a personal access token" centered>
			<form onSubmit={form.onSubmit(submit)}>
				<Stack gap="md">
					<Text size="sm" c="dimmed">
						For when the App can&apos;t be installed — an outside collaborator, or an organization that
						blocks App installs. Fine-grained tokens are recommended; a classic token is only for when a
						fine-grained one can&apos;t work, and it reaches every repository you can access, in every
						organization.
					</Text>

					<PasswordInput
						label="Personal access token"
						description={patDescription}
						data-autofocus
						key={form.key('pat')}
						{...form.getInputProps('pat')}
					/>

					<Alert color="blue" variant="light" title="Fine-grained token (recommended)">
						<List size="sm" spacing={4}>
							<List.Item>Resource owner: the organization the repository belongs to.</List.Item>
							<List.Item>Only select repositories — not all repositories.</List.Item>
							<List.Item>
								Permissions: <strong>Contents (Read and write)</strong>, <strong>Pull requests (Read and write)</strong>,{' '}
								<strong>Metadata (Read-only)</strong>, and <strong>Webhooks (Read and write)</strong> for instant sync.
							</List.Item>
							<List.Item>Pick an expiry — bosun cannot renew it for you.</List.Item>
						</List>
						<Anchor href={NEW_TOKEN_URL} target="_blank" rel="noreferrer" size="sm">
							Create a fine-grained token on GitHub
						</Anchor>
					</Alert>

					<Alert color="gray" variant="light" title="Classic token — only if fine-grained can't work">
						<Text size="sm" mb={4}>
							Needed when you&apos;re an outside collaborator on the repository, or the organization
							blocks fine-grained tokens.
						</Text>
						<List size="sm" spacing={4}>
							<List.Item>
								Scope: <strong>repo</strong>, plus <strong>admin:repo_hook</strong> for instant sync.
							</List.Item>
							<List.Item>Pick an expiry.</List.Item>
							<List.Item>If the organization uses SAML SSO, authorize the token for it after creating it.</List.Item>
						</List>
						<Anchor href={CLASSIC_TOKEN_URL} target="_blank" rel="noreferrer" size="sm">
							Create a classic token on GitHub
						</Anchor>
					</Alert>

					{isClassic ? (
						<Checkbox
							label="I understand this classic token reaches every repository I can access, in every organization"
							key={form.key('confirmedClassicScope')}
							{...form.getInputProps('confirmedClassicScope', { type: 'checkbox' })}
						/>
					) : null}

					<Text size="xs" c="dimmed">
						Every machine attached to a repository from this token receives it directly and can use it to
						clone, fetch and push — it is long-lived, unlike the App&apos;s hour-long tokens, so treat its
						scope and expiry accordingly.
					</Text>

					{connect.error === null ? null : (
						<QueryErrorAlert title="Could not connect" error={connect.error} variant="light">
							{ssoUrl === null ? null : (
								<Anchor href={ssoUrl} target="_blank" rel="noreferrer" size="sm">
									Authorize this token for SSO on GitHub
								</Anchor>
							)}
						</QueryErrorAlert>
					)}

					<Button type="submit" loading={connect.isPending} disabled={classicUnconfirmed}>
						Connect
					</Button>
				</Stack>
			</form>
		</AppModal>
	)
}
