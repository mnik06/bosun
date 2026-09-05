import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
	index('views/machines/machines-page.tsx'),
	route('machines/:machineId', 'views/machine-detail/machine-detail-page.tsx')
] satisfies RouteConfig
