import { Button, Group, Image, Skeleton, Text, UnstyledButton } from '@mantine/core'
import { FileText } from 'lucide-react'
import { useState } from 'react'

import { fetchPlanAttachment, usePlanAttachmentImageQuery } from '~/entities/plan/api/plan.queries'
import { isShownImage } from '~/entities/plan/lib/chat-attachments'
import type { ChatAttachment } from '~/entities/plan/model/chat-attachment'
import { formatFileSize, notifyError, saveBlob } from '~/shared/lib'
import { AppModal, ChatMessageBubble } from '~/shared/ui'

const THUMB_HEIGHT = 120

// Opened in place rather than in a new tab: browsers refuse to navigate a tab to
// a data URL, and the image is only held as one.
function ImageAttachment ({ planId, attachment }: { planId: string, attachment: ChatAttachment }) {
	const image = usePlanAttachmentImageQuery({ planId, attachmentId: attachment.id })
	const [open, setOpen] = useState(false)

	if (image.isError) {
		return <FileAttachment planId={planId} attachment={attachment} />
	}

	if (image.data === undefined) {
		return <Skeleton height={THUMB_HEIGHT} width={THUMB_HEIGHT} radius="sm" />
	}

	return (
		<>
			<UnstyledButton
				aria-label={`Open ${attachment.name}`}
				title={attachment.name}
				onClick={() => {
					setOpen(true)
				}}
			>
				<Image src={image.data} alt={attachment.name} h={THUMB_HEIGHT} w="auto" fit="contain" radius="sm" />
			</UnstyledButton>

			<AppModal
				opened={open}
				size="auto"
				title={attachment.name}
				onClose={() => {
					setOpen(false)
				}}
			>
				<Image src={image.data} alt={attachment.name} fit="contain" className="max-h-[80vh]" />
			</AppModal>
		</>
	)
}

function FileAttachment ({ planId, attachment }: { planId: string, attachment: ChatAttachment }) {
	const [loading, setLoading] = useState(false)

	const download = () => {
		setLoading(true)
		fetchPlanAttachment({ planId, attachmentId: attachment.id })
			.then((blob) => {
				saveBlob({ blob, name: attachment.name })
			})
			.catch((error: unknown) => {
				notifyError({ title: `Could not download ${attachment.name}`, error })
			})
			.finally(() => {
				setLoading(false)
			})
	}

	return (
		<Button
			variant="default"
			size="xs"
			loading={loading}
			leftSection={<FileText size={14} />}
			rightSection={
				<Text size="xs" c="dimmed">
					{formatFileSize(attachment.size)}
				</Text>
			}
			onClick={download}
		>
			{attachment.name}
		</Button>
	)
}

export function ChatAttachments ({ planId, attachments }: { planId: string, attachments: ChatAttachment[] }) {
	return (
		<Group gap="xs" align="end">
			{attachments.map((attachment) =>
				isShownImage(attachment.mediaType) ? (
					<ImageAttachment key={attachment.id} planId={planId} attachment={attachment} />
				) : (
					<FileAttachment key={attachment.id} planId={planId} attachment={attachment} />
				)
			)}
		</Group>
	)
}

// A person's turn in either of a plan's chats: what they wrote, then what they
// attached.
export function UserChatTurn ({ planId, text, attachments }: { planId: string, text: string, attachments: ChatAttachment[] }) {
	return (
		<ChatMessageBubble text={text}>
			{attachments.length === 0 ? null : <ChatAttachments planId={planId} attachments={attachments} />}
		</ChatMessageBubble>
	)
}
