import { McpPresetListSchema, type McpPreset } from 'src/types/McpPresetSchema';

// Served rather than compiled into the agent so the catalogue can grow without
// shipping a binary — which matters more than usual here, because updating an
// agent means someone with shell access to every machine.
const PRESETS: McpPreset[] = [
	{
		id: 'atlassian',
		name: 'Atlassian',
		description: 'Read Jira issues and Confluence pages while planning.',
		docsUrl: 'https://github.com/atlassian/atlassian-mcp-server',
		requires: [
			{
				env: 'ATLASSIAN_EMAIL',
				label: 'Atlassian account email',
				secret: false
			},
			{
				env: 'ATLASSIAN_API_TOKEN',
				label: 'Atlassian API token',
				helpUrl:
					'https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-authentication-via-api-token/'
			}
		],
		basicAuth: {
			user: 'ATLASSIAN_EMAIL',
			secret: 'ATLASSIAN_API_TOKEN',
			into: 'ATLASSIAN_BASIC_AUTH'
		},
		server: {
			type: 'http',
			url: 'https://mcp.atlassian.com/v2/mcp',
			headers: { Authorization: 'Basic ${ATLASSIAN_BASIC_AUTH}' }
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
