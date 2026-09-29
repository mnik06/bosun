// `Apps:` section parsing, split out of `project-config-sections.ts` only to
// stay under this project's file-length limit — see that file for the shape
// this feeds into.

import { splitLabel, type ConfigIssue, type LineMap, type Section } from './project-config-grammar';

const SIMPLE_APP_FIELDS: Record<string, string> = { Cwd: 'cwd', Start: 'start', Ready: 'ready', Migrate: 'migrate', Codegen: 'codegen' };
const APP_FIELDS = [...Object.keys(SIMPLE_APP_FIELDS), 'Ready timeout', 'Depends on', 'Env <KEY>'];

function applyAppField(opts: { app: Record<string, unknown>; appName: string; label: string; value: string; line: number; lineMap: LineMap; issues: ConfigIssue[] }): void {
	const { app, appName, label, value, line, lineMap, issues } = opts;
	const simpleKey = SIMPLE_APP_FIELDS[label];

	if (simpleKey !== undefined) {
		app[simpleKey] = value;
		lineMap.note(['apps', appName, simpleKey], line);

		return;
	}

	if (label === 'Ready timeout') {
		app.readyTimeoutSeconds = Number(value);
		lineMap.note(['apps', appName, 'readyTimeoutSeconds'], line);

		return;
	}

	if (label === 'Depends on') {
		app.dependsOn = value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
		lineMap.note(['apps', appName, 'dependsOn'], line);

		return;
	}

	if (label.startsWith('Env ')) {
		const key = label.slice(4).trim();
		const env = (app.env as Record<string, string> | undefined) ?? {};

		env[key] = value;
		app.env = env;
		lineMap.note(['apps', appName, 'env', key], line);

		return;
	}

	issues.push({ line, message: `unknown app field — one of ${APP_FIELDS.join(', ')}` });
}

function handleAppBullet(opts: { text: string; line: number; current: string | null; apps: Record<string, Record<string, unknown>>; lineMap: LineMap; issues: ConfigIssue[] }): void {
	const { text, line, current, apps, lineMap, issues } = opts;

	if (current === null) {
		issues.push({ line, message: 'expected an app name (e.g. `web:`) before its fields' });

		return;
	}

	const split = splitLabel(text);

	if (!split) {
		issues.push({ line, message: `expected \`- Field: value\` — one of ${APP_FIELDS.join(', ')}` });

		return;
	}

	applyAppField({ app: apps[current]!, appName: current, label: split.label, value: split.value, line, lineMap, issues });
}

export function parseApps(section: Section, issues: ConfigIssue[], lineMap: LineMap): Record<string, Record<string, unknown>> {
	const apps: Record<string, Record<string, unknown>> = {};
	let current: string | null = null;

	if (section.inline !== null) {
		issues.push({ line: section.startLine, message: 'Apps: takes no inline value — name an app below it' });
	}

	for (const line of section.body) {
		const bullet = /^- (.+)$/.exec(line.text);

		if (bullet) {
			handleAppBullet({ text: bullet[1]!, line: line.no, current, apps, lineMap, issues });

			continue;
		}

		const name = /^(\S+):(.*)$/.exec(line.text);

		if (!name) {
			issues.push({ line: line.no, message: 'unrecognized line in Apps section' });

			continue;
		}

		if (name[2]!.trim() !== '') {
			issues.push({ line: line.no, message: 'an app takes no inline value — list its fields as bulleted lines below it' });
		}

		current = name[1]!.trim();
		apps[current] = {};
		lineMap.note(['apps', current], line.no);
	}

	return apps;
}
