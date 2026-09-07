import os from 'os';
import { z } from 'zod';

const EnrollRespSchema = z.object({
	machineId: z.string(),
	machineKey: z.string(),
	serverUrl: z.url()
});

const ErrorRespSchema = z.object({ message: z.string() });

const McpRequirementSchema = z.object({
	env: z.string(),
	label: z.string(),
	helpUrl: z.string().optional()
});

export const McpPresetSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	docsUrl: z.string().optional(),
	requires: z.array(McpRequirementSchema),
	server: z.unknown()
});

export type McpPreset = z.infer<typeof McpPresetSchema>;

async function readError(res: Response, body: unknown): Promise<Error> {
	const parsed = ErrorRespSchema.safeParse(body);

	return new Error(parsed.success ? parsed.data.message : `Bosun refused the request (${res.status})`);
}

export function getBosunApiService(deps: { serverUrl: string; machineKey?: string }) {
	const base = deps.serverUrl.replace(/\/$/, '');

	async function post(opts: { path: string; body: unknown; authorized: boolean }): Promise<unknown> {
		const res = await fetch(`${base}${opts.path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(opts.authorized ? { authorization: `Bearer ${deps.machineKey ?? ''}` } : {})
			},
			body: JSON.stringify(opts.body)
		});
		const payload: unknown = await res.json().catch(() => null);

		if (!res.ok) {
			throw await readError(res, payload);
		}

		return payload;
	}

	async function get(path: string): Promise<unknown> {
		const res = await fetch(`${base}${path}`);
		const payload: unknown = await res.json().catch(() => null);

		if (!res.ok) {
			throw await readError(res, payload);
		}

		return payload;
	}

	return {
		async listMcpPresets(): Promise<McpPreset[]> {
			return z.array(McpPresetSchema).parse(await get('/mcp-presets'));
		},

		async getMcpPreset(id: string): Promise<McpPreset> {
			return McpPresetSchema.parse(await get(`/mcp-presets/${encodeURIComponent(id)}`));
		},

		async enroll(opts: { token: string; repoPath: string }) {
			const payload = await post({
				path: '/enroll',
				authorized: false,
				body: { token: opts.token, hostname: os.hostname(), repoPath: opts.repoPath }
			});

			return EnrollRespSchema.parse(payload);
		},

		async savePlanTitle(opts: { planId: string; title: string; bodyMd: string }): Promise<unknown> {
			return post({
				path: `/agent/plans/${opts.planId}/title`,
				authorized: true,
				body: { title: opts.title, bodyMd: opts.bodyMd }
			});
		},

		async addPlanAc(opts: { planId: string; code: string; text: string }): Promise<unknown> {
			return post({
				path: `/agent/plans/${opts.planId}/acs`,
				authorized: true,
				body: { code: opts.code, text: opts.text }
			});
		},

		async createPlanSlice(opts: { planId: string; slice: unknown }): Promise<unknown> {
			return post({
				path: `/agent/plans/${opts.planId}/slices`,
				authorized: true,
				body: opts.slice
			});
		}
	};
}

export type BosunApiService = ReturnType<typeof getBosunApiService>;
