// Matches the grammar's own `Notes:` header: the first line that is exactly the
// header or starts with it and a space opens the notes, which run to the end.
function isNotesHeader(line: string): boolean {
	const text = line.replace(/\r$/, '');

	return text === 'Notes:' || text.startsWith('Notes: ');
}

// The operator's instructions become the config's notes verbatim, whatever the
// model wrote there: every session reads notes, and a paraphrase would drift from
// what the leader actually said. Without instructions the model's notes stand.
export function withInstructionsAsNotes(opts: { config: string; instructions: string | null }): string {
	if (opts.instructions === null) {
		return opts.config;
	}

	const lines = opts.config.split('\n');
	const notesAt = lines.findIndex(isNotesHeader);
	const body = (notesAt === -1 ? lines : lines.slice(0, notesAt)).join('\n').trimEnd();

	return `${body === '' ? '' : `${body}\n\n`}Notes:\n${opts.instructions}`;
}
