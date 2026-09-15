import { FolderKanban, ListTodo, Server, Settings, Users, type LucideIcon } from 'lucide-react'

interface NavLinkSpec {
	to: string
	label: string
	icon: LucideIcon
	prefixes: string[]
	leaderOnly: boolean
	appOwnerOnly: boolean
}

// `prefixes` rather than the href alone: the machines tab lives at `/`, so
// matching on the href would drop the highlight the moment you open a machine.
const NAV_LINKS: NavLinkSpec[] = [
	{ to: '/plans', label: 'Plans', icon: ListTodo, prefixes: ['/plans'], leaderOnly: false, appOwnerOnly: false },
	{ to: '/', label: 'Machines', icon: Server, prefixes: ['/machines'], leaderOnly: true, appOwnerOnly: false },
	{ to: '/members', label: 'Members', icon: Users, prefixes: ['/members'], leaderOnly: true, appOwnerOnly: false },
	{
		to: '/projects',
		label: 'Projects',
		icon: FolderKanban,
		prefixes: ['/projects'],
		leaderOnly: false,
		appOwnerOnly: true
	},
	{
		to: '/settings',
		label: 'Settings',
		icon: Settings,
		prefixes: ['/settings', '/github'],
		leaderOnly: true,
		appOwnerOnly: false
	}
]

export function visibleNavLinks (opts: { isLeader: boolean, isAppOwner: boolean }): NavLinkSpec[] {
	return NAV_LINKS.filter((link) => {
		if (link.appOwnerOnly && !opts.isAppOwner) {
			return false
		}

		return opts.isLeader || !link.leaderOnly
	})
}

export function isNavLinkActive (opts: { pathname: string, to: string, prefixes: string[] }): boolean {
	return (
		opts.pathname === opts.to || opts.prefixes.some((prefix) => opts.pathname.startsWith(prefix))
	)
}

export type { NavLinkSpec }
