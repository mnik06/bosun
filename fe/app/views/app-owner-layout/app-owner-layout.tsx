import { Navigate, Outlet } from 'react-router'

import { useMeQuery } from '~/entities/session'
import { FullPageLoader } from '~/shared/ui'

// Projects is an app-owner-only screen, guarded the same way LeaderLayout guards
// Machines/Members/Settings: a pathless layout declared once beside the routes it
// covers. `/me` has no external gate before this mounts (unlike isLeader, which
// AppLayout's own loading check already settles), so this one waits on its own
// query before deciding — otherwise a real app owner gets bounced on every reload.
export default function AppOwnerLayout () {
	const { data: me, isPending } = useMeQuery()

	if (isPending) {
		return <FullPageLoader />
	}

	if (!me?.isAppOwner) {
		return <Navigate to="/plans" replace />
	}

	return <Outlet />
}
