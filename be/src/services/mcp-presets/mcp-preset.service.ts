import { McpPresetListSchema, type McpPreset } from 'src/types/McpPresetSchema';

// Served rather than compiled into the agent so the catalogue can grow without
// shipping a binary — which matters more than usual here, because updating an
// agent means someone with shell access to every machine.
const PRESETS: McpPreset[] = [
	{
		id: 'playwright',
		name: 'Playwright',
		description: 'Drive a browser — inspect a running app, read the DOM, take screenshots.',
		docsUrl: 'https://github.com/microsoft/playwright-mcp',
		requires: [],
		server: {
			type: 'stdio',
			command: 'npx',
			args: ['-y', '@playwright/mcp@latest']
		}
	}
];

export function getMcpPresetService() {
	const presets = McpPresetListSchema.parse(PRESETS);

	return {
		list(): McpPreset[] {
			return presets;
		},

		find(id: string): McpPreset | null {
			return presets.find((preset) => preset.id === id) ?? null;
		}
	};
}

export type McpPresetService = ReturnType<typeof getMcpPresetService>;
