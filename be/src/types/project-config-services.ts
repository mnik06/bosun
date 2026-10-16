// `Services:` section parsing (mirrored in `agent/src/project-config-
// services.ts`), split out of `project-config-sections.ts` only to stay under
// this project's file-length limit — see that file for the shape this feeds
// into.

import { splitLabel, type ConfigIssue, type LineMap, type Section } from './project-config-grammar';

const SERVICE_FIELDS: Record<string, string> = {
	Cwd: 'cwd',
	Start: 'start',
	Check: 'check',
	Stop: 'stop',
	'Ready timeout': 'readyTimeoutSeconds'
};
const FIELD_LIST = Object.keys(SERVICE_FIELDS).join(', ');

type Services = Record<string, Record<string, unknown>>;

function serviceField(opts: {
	text: string;
	line: number;
	current: string | null;
	services: Services;
	lineMap: LineMap;
	issues: ConfigIssue[];
}): void {
	if (opts.current === null) {
		opts.issues.push({ line: opts.line, message: 'expected a service name (e.g. `db:`) before its fields' });

		return;
	}

	const split = splitLabel(opts.text);
	const key = split === null ? undefined : SERVICE_FIELDS[split.label];

	if (split === null || key === undefined) {
		opts.issues.push({ line: opts.line, message: `expected \`- Field: value\` — one of ${FIELD_LIST}` });

		return;
	}

	opts.services[opts.current]![key] = key === 'readyTimeoutSeconds' ? Number(split.value) : split.value;
	opts.lineMap.note(['services', opts.current, key], opts.line);
}

export function parseServices(section: Section, issues: ConfigIssue[], lineMap: LineMap): Services {
	const services: Services = {};
	let current: string | null = null;

	if (section.inline !== null) {
		issues.push({ line: section.startLine, message: 'Services: takes no inline value — name a service below it' });
	}

	for (const line of section.body) {
		const bullet = /^- (.+)$/.exec(line.text);

		if (bullet) {
			serviceField({ text: bullet[1]!, line: line.no, current, services, lineMap, issues });

			continue;
		}

		const header = /^(\S+):$/.exec(line.text.trimEnd());

		if (!header) {
			issues.push({ line: line.no, message: 'expected a service name (e.g. `db:`) or one of its `- Field: value` lines' });

			continue;
		}

		current = header[1]!;
		services[current] = {};
		lineMap.note(['services', current], line.no);
	}

	return services;
}
