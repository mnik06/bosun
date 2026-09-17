import type { QueryClient } from '@tanstack/react-query'

export function refetchQuery (queryClient: QueryClient, queryKey: readonly unknown[]): void {
	queryClient.invalidateQueries({ queryKey }).catch(() => {
		// A refetch that fails leaves the cache as it was; the next push recovers.
	})
}
