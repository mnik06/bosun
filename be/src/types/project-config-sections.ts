// The per-section half of the text grammar (mirrored in
// `agent/src/project-config-sections.ts`): turns each `Section` `project-config-
// grammar.ts` found into the piece of the plain object `ProjectConfigSchema`
// validates, and into `parseSource`'s final assembly of the whole thing.

import { LineMap, splitLabel, splitSections, type ConfigIssue, type Header, type Section } from './project-config-grammar';
import { parseApps } from './project-config-apps';

const RERUN_WHEN = /^(.*) \(rerun when: (.+)\)$/;

interface CommandEntry {
	line: number;
	name: string | undefined;
	cwd: string | undefined;
	run: string;
	rerunWhen: string[] | undefined;
}

function parseRun(opts: { raw: string; withRerun: boolean }): { run: string; rerunWhen: string[] | undefined } {
	if (!opts.withRerun) {
		return { run: opts.raw, rerunWhen: undefined };
	}

	const match = RERUN_WHEN.exec(opts.raw);

	if (!match) {
		return { run: opts.raw, rerunWhen: undefined };
	}

	return { run: match[1]!.trim(), rerunWhen: match[2]!.split(',').map((entry) => entry.trim()) };
}

// The scope line either opens a block (`/dir:` alone, nothing pushed yet) or is
// itself a complete entry (`/dir: command`) — `withRerun` decides whether a
// name with no label falls back to the directory (`Install:`, whose schema
// requires one) or stays unset (`Feedback loops:`, whose schema does not).
function scopeEntry(opts: { dir: string; rest: string; line: number; withRerun: boolean }): CommandEntry | null {
	if (opts.rest === '') {
		return null;
	}

	const { run, rerunWhen } = parseRun({ raw: opts.rest, withRerun: opts.withRerun });

	return { line: opts.line, name: opts.withRerun ? opts.dir : undefined, cwd: opts.dir, run, rerunWhen };
}

function bulletEntry(opts: { text: string; line: number; withRerun: boolean; cwd: string | undefined; issues: ConfigIssue[] }): CommandEntry | null {
	const split = splitLabel(opts.text);

	if (!split || split.label === '') {
		opts.issues.push({ line: opts.line, message: 'expected `- Label: command`' });

		return null;
	}

	const { run, rerunWhen } = parseRun({ raw: split.value, withRerun: opts.withRerun });

	return { line: opts.line, name: split.label, cwd: opts.cwd, run, rerunWhen };
}

function parseInlineCommand(opts: { section: Section; header: Header; withRerun: boolean; issues: ConfigIssue[] }): CommandEntry[] {
	if (opts.section.body.length > 0) {
		opts.issues.push({ line: opts.section.startLine, message: `${opts.header} cannot combine an inline command with additional lines` });
	}

	const { run, rerunWhen } = parseRun({ raw: opts.section.inline!, withRerun: opts.withRerun });

	return [{ line: opts.section.startLine, name: opts.withRerun ? 'install' : undefined, cwd: undefined, run, rerunWhen }];
}

// `Install:` and `Feedback loops:` share this shape: a sequence of directory
// scopes and/or bare entries, each either a complete single line or a labeled
// bullet. Only `Install:` entries carry a rerun clause — `withRerun` is false
// for `Feedback loops:`, whose entries never parse one even if a command
// happens to contain the same text.
export function parseCommandSection(opts: { section: Section; header: Header; withRerun: boolean; issues: ConfigIssue[] }): CommandEntry[] {
	if (opts.section.inline !== null) {
		return parseInlineCommand(opts);
	}

	const entries: CommandEntry[] = [];
	let cwd: string | undefined;

	for (const line of opts.section.body) {
		const scope = /^\/([^:]+):(.*)$/.exec(line.text);

		if (scope) {
			const dir = scope[1]!.trim();
			const entry = scopeEntry({ dir, rest: scope[2]!.trim(), line: line.no, withRerun: opts.withRerun });

			cwd = entry ? undefined : dir;

			if (entry) {
				entries.push(entry);
			}

			continue;
		}

		const bullet = /^- (.+)$/.exec(line.text);

		if (!bullet) {
			opts.issues.push({ line: line.no, message: `unrecognized line in ${opts.header} section` });

			continue;
		}

		const entry = bulletEntry({ text: bullet[1]!, line: line.no, withRerun: opts.withRerun, cwd, issues: opts.issues });

		if (entry) {
			entries.push(entry);
		}
	}

	return entries;
}

interface RegenerateEntry {
	line: number;
	name: string;
	cwd: string | undefined;
	paths: string[];
	run: string;
}

export function parseRegenerate(section: Section, issues: ConfigIssue[]): RegenerateEntry[] {
	const entries: RegenerateEntry[] = [];
	let cwd: string | undefined;

	for (const line of section.body) {
		const scope = /^\/([^:]+):(.*)$/.exec(line.text);

		if (scope) {
			if (scope[2]!.trim() !== '') {
				issues.push({ line: line.no, message: 'Regenerate: does not support a command directly after a directory — use a bulleted entry below it' });
			}

			cwd = scope[1]!.trim();

			continue;
		}

		const bullet = /^- (.+?) \(when (.+) changes\): (.+)$/.exec(line.text);

		if (!bullet) {
			const message = /^- /.test(line.text) ? 'expected `- Label (when <glob> changes): command`' : 'unrecognized line in Regenerate section';

			issues.push({ line: line.no, message });

			continue;
		}

		entries.push({ line: line.no, name: bullet[1]!.trim(), cwd, paths: bullet[2]!.split(',').map((entry) => entry.trim()), run: bullet[3]!.trim() });
	}

	return entries;
}

interface TestAccountEntry {
	line: number;
	role: string;
	signIn: string;
	secrets: string[];
}

export function parseTestAccounts(section: Section, issues: ConfigIssue[]): TestAccountEntry[] {
	const entries: TestAccountEntry[] = [];

	for (const line of section.body) {
		const bullet = /^- ([^:]+): sign in at (.+) using (.+)$/.exec(line.text);

		if (!bullet) {
			issues.push({ line: line.no, message: 'expected `- Role: sign in at <destination> using KEY1, KEY2`' });

			continue;
		}

		entries.push({ line: line.no, role: bullet[1]!.trim(), signIn: bullet[2]!.trim(), secrets: bullet[3]!.split(',').map((entry) => entry.trim()) });
	}

	return entries;
}

export function parseToolchain(section: Section, issues: ConfigIssue[], lineMap: LineMap): Record<string, unknown> {
	const toolchain: Record<string, unknown> = {};

	if (section.inline !== null) {
		issues.push({ line: section.startLine, message: 'Toolchain: takes no inline value' });
	}

	for (const line of section.body) {
		const bullet = /^- (.+)$/.exec(line.text);
		const split = bullet ? splitLabel(bullet[1]!) : null;

		if (split?.label === 'Node') {
			toolchain.node = split.value;
			lineMap.note(['toolchain', 'node'], line.no);
		} else if (split?.label === 'Package manager') {
			toolchain.packageManager = split.value;
			lineMap.note(['toolchain', 'packageManager'], line.no);
		} else {
			issues.push({ line: line.no, message: 'expected `- Node: <version>` or `- Package manager: <name>@<version>`' });
		}
	}

	return toolchain;
}

export function parseResetDatabase(section: Section, issues: ConfigIssue[], lineMap: LineMap): Record<string, unknown> {
	const resetDatabase: Record<string, unknown> = {};

	if (section.inline !== null) {
		issues.push({ line: section.startLine, message: 'Reset database: takes no inline value' });
	}

	for (const line of section.body) {
		const bullet = /^- (.+)$/.exec(line.text);
		const split = bullet ? splitLabel(bullet[1]!) : null;

		if (split?.label === 'Cwd') {
			resetDatabase.cwd = split.value;
			lineMap.note(['verify', 'resetDatabase', 'cwd'], line.no);
		} else if (split?.label === 'Run') {
			resetDatabase.run = split.value;
			lineMap.note(['verify', 'resetDatabase', 'run'], line.no);
		} else {
			issues.push({ line: line.no, message: 'expected `- Cwd: <dir>` or `- Run: <command>`' });
		}
	}

	return resetDatabase;
}

function commandEntry(entry: CommandEntry): Record<string, unknown> {
	const out: Record<string, unknown> = { run: entry.run };

	if (entry.name !== undefined) {
		out.name = entry.name;
	}

	if (entry.cwd !== undefined) {
		out.cwd = entry.cwd;
	}

	if (entry.rerunWhen !== undefined) {
		out.rerunWhen = entry.rerunWhen;
	}

	return out;
}

type Sections = Map<Header, Section>;
type Raw = Record<string, unknown>;

function applyToolchain(sections: Sections, raw: Raw, lineMap: LineMap, issues: ConfigIssue[]): void {
	const section = sections.get('Toolchain:');

	if (!section) {
		return;
	}

	lineMap.note(['toolchain'], section.startLine);
	raw.toolchain = parseToolchain(section, issues, lineMap);
}

function applyInstall(sections: Sections, raw: Raw, lineMap: LineMap, issues: ConfigIssue[]): void {
	const section = sections.get('Install:');

	if (!section) {
		return;
	}

	lineMap.note(['setup'], section.startLine);
	raw.setup = parseCommandSection({ section, header: 'Install:', withRerun: true, issues }).map((entry, index) => {
		lineMap.note(['setup', index], entry.line);

		return commandEntry(entry);
	});
}

function applyFeedbackLoops(sections: Sections, raw: Raw, lineMap: LineMap, issues: ConfigIssue[]): void {
	const section = sections.get('Feedback loops:');

	if (!section) {
		return;
	}

	lineMap.note(['checks'], section.startLine);
	raw.checks = parseCommandSection({ section, header: 'Feedback loops:', withRerun: false, issues }).map((entry, index) => {
		lineMap.note(['checks', index], entry.line);

		return commandEntry(entry);
	});
}

function applyApps(sections: Sections, raw: Raw, lineMap: LineMap, issues: ConfigIssue[]): void {
	const section = sections.get('Apps:');

	if (!section) {
		return;
	}

	lineMap.note(['apps'], section.startLine);
	raw.apps = parseApps(section, issues, lineMap);
}

function applyRegenerate(sections: Sections, raw: Raw, lineMap: LineMap, issues: ConfigIssue[]): void {
	const section = sections.get('Regenerate:');

	if (!section) {
		return;
	}

	lineMap.note(['regenerate'], section.startLine);
	raw.regenerate = parseRegenerate(section, issues).map((entry, index) => {
		lineMap.note(['regenerate', index], entry.line);

		return { name: entry.name, cwd: entry.cwd, paths: entry.paths, run: entry.run };
	});
}

function applyResetDatabase(sections: Sections, raw: Raw, lineMap: LineMap, issues: ConfigIssue[]): void {
	const section = sections.get('Reset database:');

	if (!section) {
		return;
	}

	lineMap.note(['verify'], section.startLine);
	lineMap.note(['verify', 'resetDatabase'], section.startLine);
	raw.verify = { resetDatabase: parseResetDatabase(section, issues, lineMap) };
}

function applyTestAccounts(sections: Sections, raw: Raw, lineMap: LineMap, issues: ConfigIssue[]): void {
	const section = sections.get('Test accounts:');

	if (!section) {
		return;
	}

	lineMap.note(['testAccounts'], section.startLine);
	raw.testAccounts = parseTestAccounts(section, issues).map((entry, index) => {
		lineMap.note(['testAccounts', index], entry.line);

		return { role: entry.role, signIn: entry.signIn, secrets: entry.secrets };
	});
}

function applyNotes(notes: { line: number; text: string } | null, raw: Raw, lineMap: LineMap): void {
	if (!notes) {
		return;
	}

	raw.notes = notes.text;
	lineMap.note(['notes'], notes.line);
}

// The whole grammar pass: text in, a plain object matching `BaseSchema`'s shape
// out, with every grammar-level problem found along the way and a map of which
// line produced which part of it. The object is otherwise fed through
// `ProjectConfigSchema` unchanged by the caller — grammar and schema issues
// merge into one list there.
export function parseSource(source: string): { raw: Raw; issues: ConfigIssue[]; lineMap: LineMap } {
	const { sections, notes, issues } = splitSections(source);
	const lineMap = new LineMap();
	const raw: Raw = { version: 1, setup: [], apps: {}, checks: [], regenerate: [], testAccounts: [] };

	applyToolchain(sections, raw, lineMap, issues);
	applyInstall(sections, raw, lineMap, issues);
	applyFeedbackLoops(sections, raw, lineMap, issues);
	applyApps(sections, raw, lineMap, issues);
	applyRegenerate(sections, raw, lineMap, issues);
	applyResetDatabase(sections, raw, lineMap, issues);
	applyTestAccounts(sections, raw, lineMap, issues);
	applyNotes(notes, raw, lineMap);

	return { raw, issues, lineMap };
}
