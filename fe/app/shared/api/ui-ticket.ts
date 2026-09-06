import { z } from 'zod'

import { apiClient } from './api-client'

const UiTicketSchema = z.object({
	ticket: z.string(),
	expiresAt: z.iso.datetime()
})

export async function fetchUiTicket (): Promise<string> {
	const { data } = await apiClient.post<unknown>('/ui/ticket')

	return UiTicketSchema.parse(data).ticket
}
