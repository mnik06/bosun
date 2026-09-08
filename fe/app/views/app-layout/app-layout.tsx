import { AppShell } from '@mantine/core'
import { Navigate, Outlet } from 'react-router'

import { MachinesSocketProvider } from '~/entities/machine'
import { PlansSocketProvider } from '~/entities/plan'
import { useSession } from '~/entities/session'
import { FullPageLoader } from '~/shared/ui'
import { AppHeader } from '~/widgets/app-header'
import { AppNav } from '~/widgets/app-nav'

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
	// `breakpoint: 0` keeps the rail out of AppShell's mobile mode, where it would
	// take the full width instead of staying a rail.
	return (
		<AppShell header={{ height: 56 }} navbar={{ width: 60, breakpoint: 0 }} padding="md">
			<AppHeader email={state.session.email} />
			<AppNav />

			<AppShell.Main>
				<MachinesSocketProvider>
					<PlansSocketProvider>
						<Outlet />
					</PlansSocketProvider>
				</MachinesSocketProvider>
			</AppShell.Main>
		</AppShell>
	)
}
