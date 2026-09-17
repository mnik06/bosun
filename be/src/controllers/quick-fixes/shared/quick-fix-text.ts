import { clip } from 'src/utils/general';

const SUMMARY_CHARS = 72;

// The first line of whatever the submitter pasted — a sentence, a stack trace, a
// client's own words — capped so it reads as a title or a notification line
// rather than the whole report. Empty for a blank description; callers each
// have their own fallback for that.
export function quickFixSummary(description: string): string {
	const subject = description.trim().split('\n', 1)[0]?.trim() ?? '';

	return clip(subject, SUMMARY_CHARS);
}
