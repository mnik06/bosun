import os from 'os';
import { z } from 'zod';
import { AgentConfigSchema, writeConfig, type AgentConfig } from './config';

const EnrollRespSchema = z.object({
	machineId: z.string(),
	machineKey: z.string(),
	serverUrl: z.url()
});

const ErrorRespSchema = z.object({ message: z.string() });

async function postEnroll(opts: { serverUrl: string; token: string; repoPath: string }) {
	const res = await fetch(`${opts.serverUrl.replace(/\/$/, '')}/enroll`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			token: opts.token,
			hostname: os.hostname(),
			repoPath: opts.repoPath
		})
	});
	const body: unknown = await res.json().catch(() => ({}));

	if (!res.ok) {
		const parsed = ErrorRespSchema.safeParse(body);

		throw new Error(parsed.success ? parsed.data.message : `Enrollment failed (${res.status})`);
	}

	return EnrollRespSchema.parse(body);
}

export async function enroll(opts: {
	serverUrl: string;
	token: string;
	repoPath: string;
	configPath: string;
}): Promise<AgentConfig> {
	const enrolled = await postEnroll(opts);
	const config = AgentConfigSchema.parse({
		serverUrl: enrolled.serverUrl,
		machineId: enrolled.machineId,
		machineKey: enrolled.machineKey,
		repoPath: opts.repoPath
	});

	writeConfig({ configPath: opts.configPath, config });

	return config;
}
