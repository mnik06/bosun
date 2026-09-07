import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';

export const MCP_CONFIG_FILENAME = 'mcp.json';

// Our own server is assembled per session and carries the loopback bearer token.
// A user server under the same key would shadow it and take the planning tools
// with it, so the name is refused rather than merged over.
export const RESERVED_SERVER_NAME = 'bosun';

const McpConfigFileSchema = z.object({
	mcpServers: z.record(z.string(), z.unknown())
});

// `${VAR}` and `${VAR:-default}`, matching what Claude Code does for `.mcp.json`.
// Expansion happens here rather than being left to the CLI because that behaviour
// is documented for `.mcp.json` and not for a file passed with `--mcp-config`.
const VARIABLE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

export interface ExpandResult {
	value: unknown;
	unresolved: string[];
}

export function expandVariables(value: unknown, env: NodeJS.ProcessEnv): ExpandResult {
	const unresolved = new Set<string>();

	const walk = (input: unknown): unknown => {
		if (typeof input === 'string') {
			return input.replace(VARIABLE_PATTERN, (literal, name: string, fallback?: string) => {
				const resolved = env[name];

				if (resolved !== undefined) {
					return resolved;
				}

				if (fallback !== undefined) {
					return fallback;
				}

				// Left as written, the way Claude Code does, so the failure surfaces as a
				// server that cannot authenticate rather than one pointed at an empty URL.
				unresolved.add(name);

				return literal;
			});
		}

		if (Array.isArray(input)) {
			return input.map(walk);
		}

		if (input && typeof input === 'object') {
			return Object.fromEntries(
				Object.entries(input as Record<string, unknown>).map(([key, entry]) => [key, walk(entry)])
			);
		}

		return input;
	};

	return { value: walk(value), unresolved: [...unresolved] };
}

export interface McpConfigResult {
	present: boolean;
	servers: Record<string, unknown>;
	serverNames: string[];
	unresolved: string[];
	error: string | null;
}

const EMPTY: McpConfigResult = {
	present: false,
	servers: {},
	serverNames: [],
	unresolved: [],
	error: null
};

export function readMcpConfigFile(opts: {
	raw: string;
	env: NodeJS.ProcessEnv;
}): McpConfigResult {
	let parsed: unknown;

	try {
		parsed = JSON.parse(opts.raw);
	} catch {
		return { ...EMPTY, present: true, error: 'not valid JSON' };
	}

	const validated = McpConfigFileSchema.safeParse(parsed);

	if (!validated.success) {
		return { ...EMPTY, present: true, error: 'expected an object with an "mcpServers" key' };
	}

	const { [RESERVED_SERVER_NAME]: reserved, ...servers } = validated.data.mcpServers;
	const expanded = expandVariables(servers, opts.env);

	return {
		present: true,
		servers: expanded.value as Record<string, unknown>,
		serverNames: Object.keys(expanded.value as Record<string, unknown>),
		unresolved: expanded.unresolved,
		error:
			reserved === undefined
				? null
				: `"${RESERVED_SERVER_NAME}" is reserved for bosun's own tools and was ignored`
	};
}

export function getMcpConfigService(deps: { env: NodeJS.ProcessEnv; homeDir?: string }) {
	const configPath = path.join(deps.homeDir ?? os.homedir(), '.bosun', MCP_CONFIG_FILENAME);

	return {
		configPath,

		// A broken file must not stop planning: the session still gets bosun's own
		// tools, and the reason shows up in preflight instead of as a dead session.
		read(): McpConfigResult {
			if (!fs.existsSync(configPath)) {
				return EMPTY;
			}

			try {
				return readMcpConfigFile({ raw: fs.readFileSync(configPath, 'utf8'), env: deps.env });
			} catch {
				return { ...EMPTY, present: true, error: `could not read ${configPath}` };
			}
		}
	};
}

export type McpConfigService = ReturnType<typeof getMcpConfigService>;
