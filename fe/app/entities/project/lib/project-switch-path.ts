const LIST_ROUTES = ['/plans', '/queues', '/members']

// Where the browser lands after a project switch. A detail route names a row of
// the project being left — the plan, the queue, the machine — so reloading it
// under the new project answers 404 on a screen the person did not ask to leave.
// Its list is the nearest page that still means something.
export function projectSwitchPath (pathname: string): string {
	return LIST_ROUTES.find((route) => pathname === route || pathname.startsWith(`${route}/`)) ?? '/'
}
