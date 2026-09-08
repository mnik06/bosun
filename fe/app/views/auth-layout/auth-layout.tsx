import { Center, Paper } from '@mantine/core'
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
		<Center mih="100dvh" p="md">
			<Paper withBorder radius="md" p="xl" className="w-full max-w-105">
				<Outlet />
			</Paper>
		</Center>
	)
}
