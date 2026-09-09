import { Layers, ListTodo, Server, Users, type LucideIcon } from 'lucide-react'

interface NavLinkSpec {
	to: string
	label: string
	icon: LucideIcon
	prefixes: string[]
	leaderOnly: boolean
}

// `prefixes` rather than the href alone: the machines tab lives at `/`, so
// matching on the href would drop the highlight the moment you open a machine.
export const NAV_LINKS: NavLinkSpec[] = [
	{ to: '/', label: 'Machines', icon: Server, prefixes: ['/machines'], leaderOnly: true },
	{ to: '/plans', label: 'Plans', icon: ListTodo, prefixes: ['/plans'], leaderOnly: false },
	{ to: '/queues', label: 'Queues', icon: Layers, prefixes: ['/queues'], leaderOnly: false },
	{ to: '/members', label: 'Members', icon: Users, prefixes: ['/members'], leaderOnly: true }
]

export function visibleNavLinks (isLeader: boolean): NavLinkSpec[] {
	return NAV_LINKS.filter((link) => isLeader || !link.leaderOnly)
}

export function isNavLinkActive (opts: { pathname: string, to: string, prefixes: string[] }): boolean {
	return (
		opts.pathname === opts.to || opts.prefixes.some((prefix) => opts.pathname.startsWith(prefix))
	)
}

export type { NavLinkSpec }
