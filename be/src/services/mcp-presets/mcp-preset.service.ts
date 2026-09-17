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
	},
	{
		id: 'azure-devops',
		name: 'Azure DevOps',
		description: 'Read Azure Boards work items — fields, comments, and linked items — while planning.',
		docsUrl: 'https://github.com/microsoft/azure-devops-mcp',
		requires: [
			{ env: 'AZURE_DEVOPS_ORG', label: 'Azure DevOps organization', secret: false },
			{
				env: 'AZURE_DEVOPS_ACCOUNT',
				label: 'Account identifier for the token (any non-empty value — not checked, e.g. your email)',
				secret: false
			},
			{
				env: 'AZURE_DEVOPS_PAT',
				label:
					'Personal access token — scope it to Work Items (Read) and Project and Team (Read), one organization, short expiry',
				helpUrl:
					'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate'
			}
		],
		basicAuth: { user: 'AZURE_DEVOPS_ACCOUNT', secret: 'AZURE_DEVOPS_PAT', into: 'AZURE_DEVOPS_PAT_B64' },
		server: {
			type: 'stdio',
			command: 'npx',
			args: ['-y', '@azure-devops/mcp@2.10.0', '${AZURE_DEVOPS_ORG}', '--authentication', 'pat', '-d', 'core', 'work-items'],
			env: { PERSONAL_ACCESS_TOKEN: '${AZURE_DEVOPS_PAT_B64}' }
		},
		// Older than this, `mcp add` stores only AZURE_DEVOPS_PAT_B64 and drops
		// AZURE_DEVOPS_ORG — the config it writes references ${AZURE_DEVOPS_ORG} and
		// never resolves. GET /agent/mcp-presets/:id refuses those agents outright.
		// 4.0.3 is the first agent/package.json version carrying that fix — 4.0.2
		// (published) still has the bug, so it must not pass the gate.
		minAgentVersion: '4.0.3'
	}
];

export type McpPresetService = ReturnType<typeof getMcpPresetService>;

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
