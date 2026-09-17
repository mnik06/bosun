import { z } from 'zod'

import { NotificationSchema } from '~/entities/notification/model/notification'

export const NotificationUiMsgSchema = z.object({
	type: z.literal('notification.created'),
	notification: NotificationSchema
})

