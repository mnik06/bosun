// Kept exactly as typed. Trimming on every keystroke eats the space the moment
// it is pressed, so "pnpm install" could not be typed at all. The trim belongs
// at the save, where a trailing space is a mistake rather than a word in
// progress.
export function typed (value: string): string | null {
	return value === '' ? null : value
}

export function trimmedOrNull (value: string | null): string | null {
	return value === null || value.trim() === '' ? null : value.trim()
}
