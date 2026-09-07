import fs from 'fs';
import os from 'os';
import path from 'path';

export const ENV_FILENAME = 'env';

// systemd resolves `Environment=PATH=` at install time from the shell that ran
// the installer, which is what lets the service find node, claude and git at all.
// Letting the env file override it would silently break tool discovery for a
// value the user almost certainly did not mean to set.
const PROTECTED_KEYS = new Set(['PATH']);

const LINE_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(value: string): string {
	const trimmed = value.trim();
	const first = trimmed[0];

	if ((first === '"' || first === "'") && trimmed.length > 1 && trimmed.endsWith(first)) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

export function parseEnvFile(raw: string): Record<string, string> {
	const parsed: Record<string, string> = {};

	for (const line of raw.split('\n')) {
		if (/^\s*(#|$)/.test(line)) {
			continue;
		}

		const match = LINE_PATTERN.exec(line);

		if (match) {
			parsed[match[1]!] = unquote(match[2]!);
		}
	}

	return parsed;
}

// Read on every call rather than captured at startup. `EnvironmentFile=` is only
// consulted by systemd when the unit starts, so a token pasted into this file
// after the fact is invisible to the process until it restarts. Reading it here
// is what lets a refresh from the browser pick up a new credential.
export function getEnvService(deps: { baseEnv: NodeJS.ProcessEnv; homeDir?: string }) {
	const envPath = path.join(deps.homeDir ?? os.homedir(), '.bosun', ENV_FILENAME);

	return {
		envPath,

		current(): NodeJS.ProcessEnv {
			let raw: string;

			try {
				raw = fs.readFileSync(envPath, 'utf8');
			} catch {
				return { ...deps.baseEnv };
			}

			const overlay = Object.fromEntries(
				Object.entries(parseEnvFile(raw)).filter(([key]) => !PROTECTED_KEYS.has(key))
			);

			return { ...deps.baseEnv, ...overlay };
		}
	};
}

export type EnvService = ReturnType<typeof getEnvService>;
