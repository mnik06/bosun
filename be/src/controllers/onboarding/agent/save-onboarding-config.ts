import { HttpError } from 'src/api/errors/HttpError';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { announceOnboarding, getActiveRunForMachine } from 'src/controllers/onboarding/shared/onboarding-runs';
import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type ConfigIssue, parseProjectConfig } from 'src/types/ProjectConfigSchema';

// Validation failures go back to the session as an answer, not an HTTP error: the
// tool result is what the model reads, and "fix these fields" is something it can
// act on where a refused request is not.
export async function saveOnboardingConfig(
	deps: OnboardingDeps,
	opts: { runId: string; machineId: string; projectId: string; yaml: string }
): Promise<{ ok: true } | { ok: false; issues: ConfigIssue[] }> {
	const run = await getActiveRunForMachine(deps, opts);

	if (run.status !== 'discovering') {
		throw new HttpError(409, 'only a discovery publishes a config');
	}

	const parsed = parseProjectConfig(opts.yaml);

	if (!parsed.ok) {
		return { ok: false, issues: parsed.issues };
	}

	const [updated, repository] = await Promise.all([
		deps.onboardingRunRepo.update({ id: run.id, config: opts.yaml }),
		deps.repositoryRepo.saveConfigDraft({ id: run.repositoryId, configDraft: opts.yaml })
	]);

	if (repository) {
		announceRepository({ socketRegistry: deps.socketRegistry, repository });
	}

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: updated ?? run });

	return { ok: true };
}
