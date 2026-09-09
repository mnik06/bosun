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
	helpUrl: z.string().optional(),
	secret: z.boolean().optional()
});

export type McpRequirement = z.infer<typeof McpRequirementSchema>;

const McpBasicAuthSchema = z.object({
	user: z.string(),
	secret: z.string(),
	into: z.string()
});

export const McpPresetSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	docsUrl: z.string().optional(),
	requires: z.array(McpRequirementSchema),
	basicAuth: McpBasicAuthSchema.optional(),
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

	async function get(path: string, authorized = false): Promise<unknown> {
		const res = await fetch(`${base}${path}`, {
			headers: authorized ? { authorization: `Bearer ${deps.machineKey ?? ''}` } : {}
		});
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

		async savePlanName(opts: { planId: string; title: string }): Promise<unknown> {
			return post({
				path: `/agent/plans/${opts.planId}/name`,
				authorized: true,
				body: { title: opts.title }
			});
		},

		// The whole artifact in one call. Publishing it piece by piece put a plan
		// with two of its four bullets in front of the person, and made a revision
		// a diff against whatever the last session happened to write.
		async publishPlan(opts: { planId: string; artifact: unknown }): Promise<unknown> {
			return post({
				path: `/agent/plans/${opts.planId}/publish`,
				authorized: true,
				body: opts.artifact
			});
		},

		async savePlanSummary(opts: { planId: string; summary: unknown }): Promise<unknown> {
			return post({
				path: `/agent/plans/${opts.planId}/summary`,
				authorized: true,
				body: opts.summary
			});
		},

		async markPlanAc(opts: {
			planId: string;
			code: string;
			implemented?: boolean;
			verified?: boolean;
		}): Promise<unknown> {
			const { planId, code, ...body } = opts;

			return post({
				path: `/agent/plans/${planId}/acs/${encodeURIComponent(code)}/mark`,
				authorized: true,
				body
			});
		},

		async listMachinePlans(): Promise<unknown> {
			return get('/agent/plans', true);
		},

		async recordPlanDecision(opts: {
			planId: string;
			sliceId: string | null;
			fork: string;
			options: string | null;
			chose: string;
			blastRadius: string | null;
			reversing: string | null;
		}): Promise<unknown> {
			const { planId, ...body } = opts;

			return post({ path: `/agent/plans/${planId}/decisions`, body, authorized: true });
		},

		async setPlanBlockers(opts: { planId: string; blockedByNumbers: number[] }): Promise<unknown> {
			return post({
				path: `/agent/plans/${opts.planId}/blockers`,
				body: { blockedByNumbers: opts.blockedByNumbers },
				authorized: true
			});
		}
	};
}

export type BosunApiService = ReturnType<typeof getBosunApiService>;
