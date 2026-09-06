import { Container, Paper } from '@mantine/core'
import { Navigate, Outlet } from 'react-router'

import { useSession } from '~/entities/session'
import { FullPageLoader } from '~/shared/ui'

export default function AuthLayout () {
	const state = useSession()

	if (state.status === 'loading') {
		return <FullPageLoader />
	}

	if (state.status === 'authenticated') {
		return <Navigate to="/" replace />
	}

	return (
		<Container size={420} py="xl">
			<Paper withBorder radius="md" p="xl">
				<Outlet />
			</Paper>
		</Container>
	)
}
