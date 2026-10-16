import { HttpError } from 'src/api/errors/HttpError';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { withInstructionsAsNotes } from 'src/controllers/onboarding/shared/config-notes';
import { announceOnboarding, getActiveRunForMachine } from 'src/controllers/onboarding/shared/onboarding-runs';
import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type ConfigIssue, parseProjectConfig } from 'src/types/ProjectConfigSchema';

// Validation failures go back to the session as an answer, not an HTTP error: the
// tool result is what the model reads, and "fix these fields" is something it can
// act on where a refused request is not.
export async function saveOnboardingConfig(
	deps: OnboardingDeps,
	opts: { runId: string; machineId: string; projectId: string; text: string }
): Promise<{ ok: true } | { ok: false; issues: ConfigIssue[] }> {
	const run = await getActiveRunForMachine(deps, opts);

	if (run.status !== 'discovering') {
		throw new HttpError(409, 'only a discovery publishes a config');
	}

	// The run's own copy, not the repository's: instructions edited while this run
	// was compiling must leave its config out of date rather than marked current.
	const instructions = await deps.onboardingRunRepo.getInstructionsById(run.id);
	const text = withInstructionsAsNotes({ config: opts.text, instructions });
	const parsed = parseProjectConfig(text);

	if (!parsed.ok) {
		return { ok: false, issues: parsed.issues };
	}

	const [updated, repository] = await Promise.all([
		deps.onboardingRunRepo.update({ id: run.id, config: text }),
		deps.repositoryRepo.saveConfig({ id: run.repositoryId, config: text, configCompiledFrom: instructions })
	]);

	if (repository) {
		announceRepository({ socketRegistry: deps.socketRegistry, repository });
	}

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: updated ?? run });

	return { ok: true };
}
