import fs from 'fs';
import os from 'os';
import path from 'path';
import { type ChatAttachment } from '../chat-attachment';
import { turnWithAttachments, type StagedFile, type UnfetchedFile } from '../prompts/attachments';

// What `claude` takes inline as an image block. Anything else is left on disk for
// the session to `Read`, which handles PDFs and text, and scales a large image
// down on its own.
const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// Under the API's 5 MB per image once base64 has inflated it. A block over the
// limit fails the whole turn, not just the one image, so a larger image is only
// listed by path.
const INLINE_IMAGE_MAX_BYTES = 3.5 * 1024 * 1024;

const SAFE_NAME_MAX = 100;

export interface SessionImage {
	mediaType: string;
	data: string;
}

export interface SessionTurn {
	text: string;
	images: SessionImage[];
}

// The person's file name is the one thing here nobody on this machine chose, and
// it becomes a path. Only a conservative character set survives, a leading dot
// cannot, and the id in front keeps two `screenshot.png`s apart.
export function attachmentFileName(attachment: Pick<ChatAttachment, 'id' | 'name'>): string {
	const safe = attachment.name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-SAFE_NAME_MAX);
	const id = attachment.id.replace(/[^A-Za-z0-9_-]/g, '');

	return `${id}-${safe === '' ? 'file' : safe}`;
}

function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// Outside every worktree on purpose: a bug-fixing round commits everything it
// finds in its tree, and a screenshot has no business on the branch.
export function getAttachmentsService(deps: {
	downloadAttachment: (id: string) => Promise<Buffer>;
	homeDir?: string;
}) {
	const root = path.join(deps.homeDir ?? os.homedir(), '.bosun', 'attachments');
	const dirFor = (key: string): string => path.join(root, key.replace(/[^A-Za-z0-9_-]/g, '_'));

	const save = async (opts: { dir: string; attachment: ChatAttachment }): Promise<StagedFile & { data: Buffer }> => {
		const data = await deps.downloadAttachment(opts.attachment.id);
		const filePath = path.join(opts.dir, attachmentFileName(opts.attachment));

		await fs.promises.writeFile(filePath, data, { mode: 0o600 });

		return {
			name: opts.attachment.name,
			path: filePath,
			mediaType: opts.attachment.mediaType,
			size: data.length,
			shown: INLINE_IMAGE_TYPES.has(opts.attachment.mediaType) && data.length <= INLINE_IMAGE_MAX_BYTES,
			data
		};
	};

	return {
		// Made on every call: `--add-dir` refuses a directory that does not exist,
		// and a session is spawned before anything has been attached to it.
		root(): string {
			fs.mkdirSync(root, { recursive: true, mode: 0o700 });

			return root;
		},

		// Never rejects. A file that cannot be fetched is named in the turn instead,
		// so what the person wrote still reaches the session.
		async stageTurn(opts: { key: string; text: string; attachments: ChatAttachment[] }): Promise<SessionTurn> {
			if (opts.attachments.length === 0) {
				return { text: opts.text, images: [] };
			}

			const dir = dirFor(opts.key);
			const made = await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 }).then(
				() => null,
				(error: unknown) => reasonOf(error)
			);
			const settled = await Promise.allSettled(
				opts.attachments.map(async (attachment) => {
					if (made !== null) {
						throw new Error(made);
					}

					return save({ dir, attachment });
				})
			);
			const staged = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
			const unfetched: UnfetchedFile[] = settled.flatMap((result, index) =>
				result.status === 'rejected' ? [{ name: opts.attachments[index]!.name, reason: reasonOf(result.reason) }] : []
			);

			return {
				text: turnWithAttachments({ text: opts.text, staged, unfetched }),
				images: staged
					.filter((file) => file.shown)
					.map((file) => ({ mediaType: file.mediaType, data: file.data.toString('base64') }))
			};
		},

		release(key: string): void {
			fs.promises.rm(dirFor(key), { recursive: true, force: true }).catch((error: unknown) => {
				console.error(`could not remove attachments for ${key}: ${reasonOf(error)}`);
			});
		}
	};
}

export type AttachmentsService = ReturnType<typeof getAttachmentsService>;
