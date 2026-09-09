import { AppShell, NavLink } from '@mantine/core'
import { Link, useLocation } from 'react-router'

import { useActiveProject } from '~/entities/project'
import { isNavLinkActive, visibleNavLinks } from '~/widgets/app-nav/lib/nav-links'

export function AppNav () {
	const { pathname } = useLocation()
	const { isLeader } = useActiveProject()
	const links = visibleNavLinks(isLeader)

	// The rail keeps its collapsed width in the layout and only the element grows
	// on hover, so the expanded labels float over the page instead of shoving it.
	// Hover is not a gesture a phone has, which is why the small screen gets the
	// bottom bar instead of this.
	return (
		<AppShell.Navbar className="group w-15 overflow-hidden transition-[width] duration-200 ease-out hover:w-56 hover:shadow-2xl">
			<div className="w-56 py-2">
				{links.map((link) => (
					<NavLink
						key={link.to}
						component={Link}
						to={link.to}
						px={20}
						variant="filled"
						active={isNavLinkActive({ pathname, to: link.to, prefixes: link.prefixes })}
						leftSection={<link.icon size={20} />}
						label={
							<span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
								{link.label}
							</span>
						}
					/>
				))}
			</div>
		</AppShell.Navbar>
	)
}
