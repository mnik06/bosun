const SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_LENGTH = 200;
const ROOT = '.';

// The result is joined onto a worktree on the machine and written to, so anything
// that could climb out of the repository or name the same directory two ways is
// refused rather than cleaned up. The agent applies the same rules; a path that
// normalizes differently on the two sides would be a set bosun reports under one
// name and the machine stores under another.
export function normalizeEnvPath(raw: string): string | null {
	let path = raw.trim();

	if (path.includes('\\') || path.includes('\0')) {
		return null;
	}

	while (path.startsWith('./')) {
		path = path.slice(2);
	}

	path = path.replace(/^\/+/, '').replace(/\/+$/, '');

	// `.` is what this returns for the root, so it has to be accepted back:
	// the agent re-normalizes every path bosun sends it.
	if (path === '' || path === ROOT) {
		return ROOT;
	}

	if (path.length > MAX_LENGTH) {
		return null;
	}

	const valid = path
		.split('/')
		.every((segment) => segment !== '.' && segment !== '..' && SEGMENT.test(segment));

	return valid ? path : null;
}
