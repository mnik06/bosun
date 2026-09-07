import { useMutation, useQueryClient } from '@tanstack/react-query'

import { planKeys, type SliceKind } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

type AcVars =
	| { kind: 'update-ac', acId: string, text?: string, sliceId?: string | null }
	| { kind: 'delete-ac', acId: string }
	| { kind: 'create-slice', title: string }
	| { kind: 'update-slice', sliceId: string, title?: string, bodyMd?: string, ordinal?: number }
	| { kind: 'delete-slice', sliceId: string }

async function apply (opts: { planId: string, vars: AcVars }): Promise<void> {
	const base = `/plans/${opts.planId}`

	if (opts.vars.kind === 'update-ac') {
		const { kind: _kind, acId, ...body } = opts.vars

		await apiClient.patch(`${base}/acs/${acId}`, body)

		return
	}

	if (opts.vars.kind === 'delete-ac') {
		await apiClient.delete(`${base}/acs/${opts.vars.acId}`)

		return
	}

	if (opts.vars.kind === 'create-slice') {
		await apiClient.post(`${base}/slices`, { title: opts.vars.title })

		return
	}

	if (opts.vars.kind === 'update-slice') {
		const { kind: _kind, sliceId, ...body } = opts.vars

		await apiClient.patch(`${base}/slices/${sliceId}`, body)

		return
	}

	await apiClient.delete(`${base}/slices/${opts.vars.sliceId}`)
}

// The backend pushes the whole artifact after every write, but only to sockets
// watching this plan. Invalidating covers the case where that push is missed —
// a reconnect mid-write — rather than being the primary path.
export function useEditArtifact (planId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (vars: AcVars) => apply({ planId, vars }),
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: planKeys.detail(planId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not save the change', error })
		}
	})
}

export type { AcVars, SliceKind }
