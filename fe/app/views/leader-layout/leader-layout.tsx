import { Navigate, Outlet } from 'react-router'

import { useActiveProject } from '~/entities/project'

// Machines and members are leader-only screens. The guard is a pathless layout so
// it is declared once, in the same file as the routes it covers — a per-page check
// is one a new screen can be added without.
export default function LeaderLayout () {
	const { isLeader } = useActiveProject()

	if (!isLeader) {
		return <Navigate to="/plans" replace />
	}

	return <Outlet />
}
