export interface StagedFile {
	name: string;
	path: string;
	mediaType: string;
	size: number;
	// Also sent as an image block on the same turn.
	shown: boolean;
}

export interface UnfetchedFile {
	name: string;
	reason: string;
}

function sizeLabel(bytes: number): string {
	return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Every file is listed by path, shown or not: an image block is gone from view
// once the conversation compacts, and a path is what lets the session look again.
// A file that never arrived is named too, so the session says what it has not
// seen instead of answering as though it had.
export function turnWithAttachments(opts: { text: string; staged: StagedFile[]; unfetched: UnfetchedFile[] }): string {
	const parts = [opts.text.trim() === '' ? 'The person sent the attached files without writing anything.' : opts.text];

	if (opts.staged.length > 0) {
		parts.push(
			[
				'Files the person attached to this message, saved on this machine. Open them with `Read`; the images among them are also shown to you with this message.',
				...opts.staged.map(
					(file) => `- \`${file.path}\` — ${file.name} (${file.mediaType}, ${sizeLabel(file.size)}${file.shown ? ', shown' : ''})`
				)
			].join('\n')
		);
	}

	if (opts.unfetched.length > 0) {
		parts.push(
			[
				'These attached files could not be fetched, so you have not seen them. Tell the person rather than guessing at what they contain:',
				...opts.unfetched.map((file) => `- ${file.name}: ${file.reason}`)
			].join('\n')
		);
	}

	return parts.join('\n\n');
}
