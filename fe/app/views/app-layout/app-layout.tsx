import { Navigate, Outlet } from 'react-router'

import { MachinesSocketProvider } from '~/entities/machine'
import { useSession } from '~/entities/session'
import { FullPageLoader } from '~/shared/ui'
import { AppHeader } from '~/widgets/app-header'

export default function AppLayout () {
	const state = useSession()

	if (state.status === 'loading') {
		return <FullPageLoader />
	}

	if (state.status === 'anonymous') {
		return <Navigate to="/login" replace />
	}

	// The socket lives here rather than at the root so it is only ever opened by
	// a signed-in browser — it needs a ticket the backend will only issue to one.
	return (
		<>
			<AppHeader email={state.session.email} />
			<MachinesSocketProvider>
				<Outlet />
			</MachinesSocketProvider>
		</>
	)
}
