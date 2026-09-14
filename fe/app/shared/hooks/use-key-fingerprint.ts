import { useQuery } from '@tanstack/react-query'

import { keyFingerprint } from '~/shared/lib'

const fingerprintKey = (publicKey: string | null | undefined) => ['key-fingerprint', publicKey ?? null] as const

export function useKeyFingerprint (publicKey: string | null | undefined): string | null {
	const { data } = useQuery({
		queryKey: fingerprintKey(publicKey),
		queryFn: async () => (publicKey == null ? null : keyFingerprint(publicKey)),
		staleTime: Infinity
	})

	return data ?? null
}
