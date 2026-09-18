import { z } from 'zod'

export const NotificationKindSchema = z.enum([
	'onboarding.needs_input',
	'onboarding.ready',
	'onboarding.failed',
	'onboarding.machine_offline',
	'plan.ready',
	'plan.failed',
	'plan.message',
	'plan.unblocked',
	'build.waiting_answer',
	'build.needs_you',
	'build.merged',
	'build.failed',
	'build.machine_offline',
	'build.in_review',
	'build.cancelled',
	'machine.online',
	'machine.offline',
	'quickfix.pushed',
	'quickfix.failed'
])

export const NotificationSchema = z.object({
	id: z.string(),
	kind: NotificationKindSchema,
	title: z.string(),
	body: z.string(),
	url: z.string(),
	planId: z.string().nullable(),
	sentAt: z.iso.datetime(),
	readAt: z.iso.datetime().nullable()
})

export type Notification = z.infer<typeof NotificationSchema>

export const UnreadCountSchema = z.object({
	planId: z.string(),
	count: z.number().int()
})

export type UnreadCount = z.infer<typeof UnreadCountSchema>
