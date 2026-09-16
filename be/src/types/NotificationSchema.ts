import { z } from 'zod';

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
	'machine.offline'
]);

export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationSchema = z.object({
	id: z.string(),
	kind: NotificationKindSchema,
	title: z.string(),
	body: z.string(),
	url: z.url(),
	planId: z.string().nullable(),
	machineId: z.string().nullable(),
	sentAt: z.coerce.date(),
	readAt: z.coerce.date().nullable()
});

export type Notification = z.infer<typeof NotificationSchema>;
