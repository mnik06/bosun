import { Alert, Anchor, Center, Loader, Stack, Text } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useCompleteGithubInstall, useImportGithubInstallations } from '~/features/connect-github'
import { Page } from '~/shared/ui'
import { toErrorMessage } from '~/shared/lib'

function BackToSettings () {
	return (
		<Anchor component={Link} to="/settings" size="sm">
			Back to settings
		</Anchor>
	)
}

function Notice ({ color, title, children }: { color: string, title: string, children: string }) {
	return (
		<Page title="Connect GitHub">
			<Alert color={color} variant="light" title={title}>
				<Stack gap="xs" align="start">
					<Text size="sm">{children}</Text>
					<BackToSettings />
				</Stack>
			</Alert>
		</Page>
	)
}

export default function GithubCallbackPage () {
	const [params] = useSearchParams()
	const navigate = useNavigate()
	const { mutate: completeInstall, error: installError } = useCompleteGithubInstall()
	const { mutate: importInstallations, error: importError } = useImportGithubInstallations()
	// The code GitHub hands back is single-use, so a second post — React's
	// development double effect, a re-render — would be refused and read as a
	// failed connection that in fact succeeded.
	const sent = useRef(false)
	const installationParam = params.get('installation_id')
	const installationId = Number(installationParam)
	const code = params.get('code')
	const state = params.get('state')
	const requested = params.get('setup_action') === 'request'
	// No installation id is an authorization on its own — the App was already
	// installed on the account — so every installation it reaches is imported.
	const authorizationOnly = installationParam === null
	const valid = code !== null && state !== null && (authorizationOnly || (Number.isInteger(installationId) && installationId > 0))
	const failure = installError ?? importError

	useEffect(() => {
		// A request is not an installation yet. GitHub may still hand back an
		// authorization with it, and importing on that would bounce the person to
		// Settings past the only screen that says an owner has to approve.
		if (sent.current || !valid || requested) {
			return
		}

		sent.current = true

		const done = {
			onSuccess: () => {
				void navigate('/settings', { replace: true })
			}
		}

		if (authorizationOnly) {
			importInstallations({ code, state }, done)
		} else {
			completeInstall({ installationId, code, state }, done)
		}
	}, [authorizationOnly, completeInstall, importInstallations, navigate, installationId, code, state, valid, requested])

	if (requested) {
		return (
			<Notice color="blue" title="Waiting for an organization owner">
				The installation was requested. Once an owner approves it on GitHub, connect again from Settings.
			</Notice>
		)
	}

	if (failure !== null || !valid) {
		return (
			<Notice color="red" title="GitHub was not connected">
				{failure === null
					? 'GitHub did not send back an authorization. Start again from Settings.'
					: toErrorMessage(failure, 'Unknown error')}
			</Notice>
		)
	}

	return (
		<Page title="Connect GitHub">
			<Center py="xl">
				<Stack gap="sm" align="center">
					<Loader />
					<Text size="sm" c="dimmed">
						Confirming with GitHub which installations you can access…
					</Text>
				</Stack>
			</Center>
		</Page>
	)
}
