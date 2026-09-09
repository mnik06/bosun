import { Alert, AppShell } from '@mantine/core'
import { Navigate, Outlet } from 'react-router'

import { MachinesSocketProvider } from '~/entities/machine'
import { PlansSocketProvider } from '~/entities/plan'
import { ActiveProjectProvider, useActiveProject } from '~/entities/project'
import { useSession } from '~/entities/session'
import { FullPageLoader } from '~/shared/ui'
import { AppHeader } from '~/widgets/app-header'
import { AppNav, MobileNav } from '~/widgets/app-nav'
import { ProjectSwitcher } from '~/widgets/project-switcher'

// Nothing below may make a scoped request before a project is chosen: the header
// carries the project, and the backend answers 400 rather than guessing.
function ProjectScoped ({ email }: { email: string }) {
	const { activeProject, isLoading } = useActiveProject()

	if (isLoading) {
		return <FullPageLoader />
	}

	if (activeProject === null) {
		return (
			<Alert color="blue" m="md">
				You are not a member of any project yet. Ask a project leader to add you.
			</Alert>
		)
	}

	// The rail is gone below `sm` rather than collapsed into a burger: the same
	// four destinations sit in a bottom bar, where a thumb reaches them. `Main`
	// pays for that bar in padding, because the bar is fixed to the viewport.
	return (
		<AppShell
			className="app-shell"
			header={{ height: 56 }}
			navbar={{ width: 60, breakpoint: 'sm', collapsed: { mobile: true } }}
			padding={{ base: 'sm', sm: 'md' }}
		>
			<AppHeader email={email} projectSwitcher={<ProjectSwitcher />} />
			<AppNav />

			<AppShell.Main className="min-w-0 max-sm:pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))]">
				<MachinesSocketProvider>
					<PlansSocketProvider>
						<Outlet />
					</PlansSocketProvider>
				</MachinesSocketProvider>
			</AppShell.Main>

			<MobileNav />
		</AppShell>
	)
}

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
		<ActiveProjectProvider>
			<ProjectScoped email={state.session.email} />
		</ActiveProjectProvider>
	)
}
