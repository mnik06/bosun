import { index, layout, route, type RouteConfig } from '@react-router/dev/routes'

export default [
	layout('views/auth-layout/auth-layout.tsx', [route('login', 'views/login/login-page.tsx')]),
	layout('views/app-layout/app-layout.tsx', [
		layout('views/leader-layout/leader-layout.tsx', [
			index('views/machines/machines-page.tsx'),
			route('machines/:machineId', 'views/machine-detail/machine-detail-page.tsx'),
			route('members', 'views/members/members-page.tsx')
		]),
		route('plans', 'views/plans/plans-page.tsx'),
		route('queues', 'views/queues/queues-page.tsx'),
		route('queues/:queueId', 'views/queue-detail/queue-detail-page.tsx'),
		route('plans/:planId', 'views/plan-detail/plan-page.tsx')
	])
] satisfies RouteConfig
