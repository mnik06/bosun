import { Alert, Anchor, Center, Loader, Stack, Text } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { useCompleteGithubInstall } from '~/features/connect-github'
import { Page } from '~/shared/ui'
import { toErrorMessage } from '~/shared/lib'

function BackToRepositories () {
	return (
		<Anchor component={Link} to="/repositories" size="sm">
			Back to repositories
		</Anchor>
	)
}

export default function GithubCallbackPage () {
	const [params] = useSearchParams()
	const navigate = useNavigate()
	const { mutate, error, isError } = useCompleteGithubInstall()
	// The code GitHub hands back is single-use, so a second post — React's
	// development double effect, a re-render — would be refused and read as a
	// failed connection that in fact succeeded.
	const sent = useRef(false)
	const installationId = Number(params.get('installation_id'))
	const code = params.get('code')
	const state = params.get('state')
	const requested = params.get('setup_action') === 'request'

	useEffect(() => {
		if (sent.current || code === null || state === null || !Number.isInteger(installationId) || installationId <= 0) {
			return
		}

		sent.current = true
		mutate(
			{ installationId, code, state },
			{
				onSuccess: () => {
					void navigate('/repositories', { replace: true })
				}
			}
		)
	}, [mutate, navigate, installationId, code, state])

	if (requested) {
		return (
			<Page title="Connect GitHub">
				<Alert color="blue" variant="light" title="Waiting for an organization owner">
					<Stack gap="xs" align="start">
						<Text size="sm">
							The installation was requested. Once an owner approves it on GitHub, connect again from
							Repositories.
						</Text>
						<BackToRepositories />
					</Stack>
				</Alert>
			</Page>
		)
	}

	if (isError || code === null || state === null || installationId <= 0 || Number.isNaN(installationId)) {
		return (
			<Page title="Connect GitHub">
				<Alert color="red" variant="light" title="GitHub was not connected">
					<Stack gap="xs" align="start">
						<Text size="sm">
							{isError
								? toErrorMessage(error, 'Unknown error')
								: 'GitHub did not send back an installation and an authorization. Start again from Repositories.'}
						</Text>
						<BackToRepositories />
					</Stack>
				</Alert>
			</Page>
		)
	}

	return (
		<Page title="Connect GitHub">
			<Center py="xl">
				<Stack gap="sm" align="center">
					<Loader />
					<Text size="sm" c="dimmed">
						Confirming with GitHub that you can access this installation…
					</Text>
				</Stack>
			</Center>
		</Page>
	)
}
