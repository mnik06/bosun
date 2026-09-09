import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'

import { SessionProvider } from '~/entities/session'
import { theme } from '~/theme'

import './app.css'

import type { Route } from './+types/root'

export const links: Route.LinksFunction = () => []

export function meta (_: Route.MetaArgs) {
	return [{ title: 'bosun' }]
}

export function Layout ({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" {...mantineHtmlProps}>
			<head>
				<meta charSet="utf-8" />
				{/* `viewport-fit=cover` is what makes `env(safe-area-inset-*)` report
				    anything at all, which the bottom bar needs to clear the home
				    indicator on an installed iOS copy. */}
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, viewport-fit=cover"
				/>
				<meta name="theme-color" content="#0a0a0c" />
				<meta name="mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-title" content="bosun" />
				<meta name="apple-mobile-web-app-status-bar-style" content="default" />
				<link rel="manifest" href="/manifest.webmanifest" />
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
				<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
				<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
				<ColorSchemeScript defaultColorScheme="dark" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	)
}

function QueryProvider ({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60_000,
						refetchOnWindowFocus: false
					}
				}
			})
	)

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			{import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
		</QueryClientProvider>
	)
}

export default function App () {
	return (
		<QueryProvider>
			<MantineProvider theme={theme} defaultColorScheme="dark">
				<ModalsProvider modalProps={{ centered: true }}>
					<Notifications />
					<SessionProvider>
						<Outlet />
					</SessionProvider>
				</ModalsProvider>
			</MantineProvider>
		</QueryProvider>
	)
}

export function ErrorBoundary ({ error }: Route.ErrorBoundaryProps) {
	let message = 'Oops!'
	let details = 'An unexpected error occurred.'
	let stack: string | undefined

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? '404' : 'Error'
		details =
			error.status === 404 ? 'The requested page could not be found.' : error.statusText || details
	} else if (error instanceof Error && import.meta.env.DEV) {
		details = error.message
		stack = error.stack
	}

	return (
		<main className="container mx-auto p-4 pt-16">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack ? (
				<pre className="w-full overflow-x-auto p-4">
					<code>{stack}</code>
				</pre>
			) : null}
		</main>
	)
}
