import os from 'os';
import { z } from 'zod';

const EnrollRespSchema = z.object({
	machineId: z.string(),
	machineKey: z.string(),
	serverUrl: z.url(),
	appUrl: z.url().optional()
});

const ErrorRespSchema = z.object({ message: z.string() });

const GitCredentialRespSchema = z.object({ token: z.string(), expiresAt: z.string() });

const PlanCriteriaRespSchema = z.array(
	z.object({
		planNumber: z.number().int(),
		title: z.string(),
		acs: z.array(z.object({ code: z.string(), text: z.string() }))
	})
);

const McpRequirementSchema = z.object({
	env: z.string(),
	label: z.string(),
	helpUrl: z.string().optional(),
	secret: z.boolean().optional()
});

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

		async enroll(opts: { token: string; repoPath: string | null }) {
			const payload = await post({
				path: '/enroll',
				authorized: false,
				body: {
					token: opts.token,
					hostname: os.hostname(),
					...(opts.repoPath === null ? {} : { repoPath: opts.repoPath })
				}
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
			blockedReason?: string;
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

		async gitCredential(): Promise<{ token: string; expiresAt: string }> {
			return GitCredentialRespSchema.parse(await post({ path: '/agent/git-credential', body: {}, authorized: true }));
		},

		async reportOnboardingStep(opts: {
			runId: string;
			label: string;
			status: 'info' | 'running' | 'passed' | 'failed';
			detail: string | null;
			progress?: number | null;
		}): Promise<unknown> {
			const { runId, ...body } = opts;

			return post({ path: `/agent/onboarding/${encodeURIComponent(runId)}/steps`, body, authorized: true });
		},

		// Validation issues come back as an answer rather than a refusal, so the
		// session reads which fields to fix.
		async publishOnboardingConfig(opts: { runId: string; yaml: string }): Promise<unknown> {
			return post({
				path: `/agent/onboarding/${encodeURIComponent(opts.runId)}/config`,
				body: { yaml: opts.yaml },
				authorized: true
			});
		},

		async reportOnboardingRequirement(opts: {
			runId: string;
			kind: 'env' | 'secret' | 'policy';
			path: string | null;
			key: string;
			why: string;
			evidence: string;
			optional: boolean;
		}): Promise<unknown> {
			const { runId, ...body } = opts;

			return post({ path: `/agent/onboarding/${encodeURIComponent(runId)}/requirements`, body, authorized: true });
		},

		async recordOnboardingAssumption(opts: { runId: string; text: string; evidence: string }): Promise<unknown> {
			const { runId, ...body } = opts;

			return post({ path: `/agent/onboarding/${encodeURIComponent(runId)}/assumptions`, body, authorized: true });
		},

		async setPlanBlockers(opts: { planId: string; blockedByNumbers: number[] }): Promise<unknown> {
			return post({
				path: `/agent/plans/${opts.planId}/blockers`,
				body: { blockedByNumbers: opts.blockedByNumbers },
				authorized: true
			});
		},

		// The criteria of other plans, by number: what a conflict session needs to
		// resolve a conflict with both plans' intent, not only its own.
		async planCriteria(numbers: number[]): Promise<z.infer<typeof PlanCriteriaRespSchema>> {
			if (numbers.length === 0) {
				return [];
			}

			return PlanCriteriaRespSchema.parse(await get(`/agent/plans/criteria?numbers=${numbers.join(',')}`, true));
		},

		async reportFinding(opts: {
			buildId: string;
			runId: string;
			acCode: string | null;
			kind: 'criterion' | 'console' | 'network' | 'visual';
			reproduction: string;
			severity: 'high' | 'medium' | 'low';
		}): Promise<unknown> {
			const { buildId, ...body } = opts;

			return post({ path: `/agent/builds/${encodeURIComponent(buildId)}/findings`, body, authorized: true });
		},

		async resolveFinding(opts: { findingId: string; status: 'fixed' | 'left'; note: string }): Promise<unknown> {
			const { findingId, ...body } = opts;

			return post({ path: `/agent/findings/${encodeURIComponent(findingId)}/resolve`, body, authorized: true });
		}
	};
}

export type BosunApiService = ReturnType<typeof getBosunApiService>;
