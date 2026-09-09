import clsx from 'clsx'
import { Link, useLocation } from 'react-router'

import { useActiveProject } from '~/entities/project'
import { isNavLinkActive, visibleNavLinks } from '~/widgets/app-nav/lib/nav-links'

// Fixed to the viewport rather than placed in the AppShell footer: the plan page
// sizes itself against `--app-content-height`, and a footer in the flow would be
// measured twice. `AppShell.Main` reserves the same height as bottom padding.
export function MobileNav () {
	const { pathname } = useLocation()
	const { isLeader } = useActiveProject()
	const links = visibleNavLinks(isLeader)

	return (
		<nav
			aria-label="Primary"
			className="fixed inset-x-0 bottom-0 z-100 flex h-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] items-start border-t border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-body)] pb-[env(safe-area-inset-bottom)] sm:hidden"
		>
			{links.map((link) => {
				const active = isNavLinkActive({ pathname, to: link.to, prefixes: link.prefixes })

				return (
					<Link
						key={link.to}
						to={link.to}
						aria-current={active ? 'page' : undefined}
						className={clsx(
							'flex h-[var(--mobile-nav-height)] grow flex-col items-center justify-center gap-1 text-[0.6875rem] no-underline',
							active
								? 'text-[var(--mantine-primary-color-filled)]'
								: 'text-[var(--mantine-color-dimmed)]'
						)}
					>
						<link.icon size={20} />
						{link.label}
					</Link>
				)
			})}
		</nav>
	)
}
