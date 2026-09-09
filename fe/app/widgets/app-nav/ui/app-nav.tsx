import { AppShell, NavLink } from '@mantine/core'
import { Layers, ListTodo, Server, Users } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { useActiveProject } from '~/entities/project'

// `prefixes` rather than the href alone: the machines tab lives at `/`, so
// matching on the href would drop the highlight the moment you open a machine.
const LINKS = [
	{ to: '/', label: 'Machines', icon: Server, prefixes: ['/machines'], leaderOnly: true },
	{ to: '/plans', label: 'Plans', icon: ListTodo, prefixes: ['/plans'], leaderOnly: false },
	{ to: '/queues', label: 'Queues', icon: Layers, prefixes: ['/queues'], leaderOnly: false },
	{ to: '/members', label: 'Members', icon: Users, prefixes: ['/members'], leaderOnly: true }
]

function isActive (opts: { pathname: string, to: string, prefixes: string[] }): boolean {
	return (
		opts.pathname === opts.to ||
		opts.prefixes.some((prefix) => opts.pathname.startsWith(prefix))
	)
}

export function AppNav () {
	const { pathname } = useLocation()
	const { isLeader } = useActiveProject()
	const links = LINKS.filter((link) => isLeader || !link.leaderOnly)

	// The rail keeps its collapsed width in the layout and only the element grows
	// on hover, so the expanded labels float over the page instead of shoving it.
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
						active={isActive({ pathname, to: link.to, prefixes: link.prefixes })}
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
