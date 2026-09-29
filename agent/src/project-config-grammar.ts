// The lexical half of the text grammar behind `parseProjectConfig` in
// `project-config.ts` (mirrored in `be/src/types/project-config-grammar.ts`).
// Splits a document into its named sections — one per repository, in any
// order, each at most once, blank lines allowed anywhere between blocks —
// without knowing anything about what any section means. `project-config-
// sections.ts` turns each section into part of the object `ProjectConfigSchema`
// validates; this file only finds where each one starts and ends.
//
// A grammar-level problem (an unknown section, a malformed line) is reported
// the same way a schema-level one is (a `dependsOn` cycle, a bad regex):
// `{ line, message }`. `LineMap` is the seam that makes that possible — every
// section parser records which source line produced which part of the object,
// keyed on the same dot/bracket path Zod itself reports issues against, so a
// Zod issue can be pinned back to a line.

export interface ConfigIssue {
	line: number | null;
	message: string;
}

const HEADERS = [
	'Toolchain:',
	'Install:',
	'Feedback loops:',
	'Apps:',
	'Regenerate:',
	'Reset database:',
	'Test accounts:',
	'Notes:'
] as const;

export type Header = (typeof HEADERS)[number];

export interface SourceLine {
	no: number;
	text: string;
}

export interface Section {
	startLine: number;
	inline: string | null;
	body: SourceLine[];
}

function formatPath(path: readonly (string | number)[]): string {
	return path.reduce<string>((joined, segment) => {
		if (typeof segment === 'number') {
			return `${joined}[${segment}]`;
		}

		return joined === '' ? String(segment) : `${joined}.${String(segment)}`;
	}, '') || '(root)';
}

// Where in the source a part of the built-up object came from, keyed the same
// way Zod paths format — so a Zod issue on that same path is pinned to the line
// that wrote it, and one on a path nobody wrote (an array grown too long) falls
// back to whatever ancestor path was registered, down to the section header.
export class LineMap {
	private readonly lines = new Map<string, number>();

	note(path: (string | number)[], line: number): void {
		this.lines.set(formatPath(path), line);
	}

	lineFor(path: readonly PropertyKey[]): number | null {
		for (let end = path.length; end >= 0; end--) {
			const key = formatPath(path.slice(0, end) as (string | number)[]);
			const found = this.lines.get(key);

			if (found !== undefined) {
				return found;
			}
		}

		return null;
	}
}

function matchHeader(text: string): { header: Header; inline: string | null } | null {
	for (const header of HEADERS) {
		if (text === header) {
			return { header, inline: null };
		}

		if (text.startsWith(`${header} `)) {
			const value = text.slice(header.length).trim();

			return { header, inline: value === '' ? null : value };
		}
	}

	return null;
}

interface SplitState {
	sections: Map<Header, Section>;
	issues: ConfigIssue[];
	notes: { line: number; text: string } | null;
	current: Header | 'discard' | null;
}

// Everything after a `Notes:` header, inline value included, verbatim to the
// end of the document — so a stray blank line or a paragraph that happens to
// start with a word ending in a colon is still just notes.
function captureNotes(state: SplitState, opts: { lines: SourceLine[]; index: number; inline: string | null }): void {
	const line = opts.lines[opts.index]!.no;
	const rest = opts.lines.slice(opts.index + 1).map((entry) => entry.text);
	const text = opts.inline === null ? rest.join('\n') : [opts.inline, ...rest].join('\n');

	if (state.notes === null) {
		state.notes = { line, text };
	} else {
		state.issues.push({ line, message: 'Notes: appears more than once' });
	}
}

function openSection(state: SplitState, opts: { matched: { header: Header; inline: string | null }; line: SourceLine }): void {
	const { matched, line } = opts;

	if (state.sections.has(matched.header)) {
		state.issues.push({ line: line.no, message: `${matched.header} appears more than once` });
		state.current = 'discard';

		return;
	}

	state.sections.set(matched.header, { startLine: line.no, inline: matched.inline, body: [] });
	state.current = matched.header;
}

function addBodyLine(state: SplitState, line: SourceLine): void {
	if (state.current === null) {
		state.issues.push({ line: line.no, message: 'expected a section header' });

		return;
	}

	if (state.current !== 'discard') {
		state.sections.get(state.current)!.body.push(line);
	}
}

// The first pass: turn the document into named sections (and, for `Notes:`,
// everything after it verbatim) without knowing anything about what any of them
// mean yet.
export function splitSections(source: string): { sections: Map<Header, Section>; notes: { line: number; text: string } | null; issues: ConfigIssue[] } {
	const lines: SourceLine[] = source.split('\n').map((text, index) => ({ no: index + 1, text: text.replace(/\r$/, '') }));
	const state: SplitState = { sections: new Map(), issues: [], notes: null, current: null };

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		const matched = matchHeader(line.text);

		if (matched?.header === 'Notes:') {
			captureNotes(state, { lines, index, inline: matched.inline });
			break;
		}

		if (matched) {
			openSection(state, { matched, line });

			continue;
		}

		if (line.text.trim() !== '') {
			addBodyLine(state, line);
		}
	}

	return { sections: state.sections, notes: state.notes, issues: state.issues };
}

// `- Label: value` and `/dir:` scope lines both split on the first `: ` — a
// label never contains one, and a shell command almost never does (`://` has no
// space after the colon).
export function splitLabel(text: string): { label: string; value: string } | null {
	const at = text.indexOf(': ');

	return at === -1 ? null : { label: text.slice(0, at).trim(), value: text.slice(at + 2).trim() };
}
