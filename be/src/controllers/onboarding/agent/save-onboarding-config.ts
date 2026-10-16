import { HttpError } from 'src/api/errors/HttpError';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { withInstructionsAsNotes } from 'src/controllers/onboarding/shared/config-notes';
import { announceOnboarding, getActiveRunForMachine } from 'src/controllers/onboarding/shared/onboarding-runs';
import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type ConfigIssue, parseProjectConfig } from 'src/types/ProjectConfigSchema';
import { type Repository } from 'src/types/RepositorySchema';

// The session's rewrite replaces the operator's text only while that text is
// still what the run started from: an edit made while it ran is newer than the
// rewrite, so it stays and the config reads as out of date against it.
async function adoptInstructions(
	deps: OnboardingDeps,
	opts: { repositoryId: string; projectId: string; started: string | null; written: string | null }
): Promise<Repository | null> {
	const current = await deps.repositoryRepo.getById(opts.repositoryId);

	if (opts.written === null || current === null || current.instructions !== opts.started) {
		return current;
	}

	return deps.repositoryRepo.saveInstructions({ id: opts.repositoryId, projectId: opts.projectId, instructions: opts.written });
}

// Validation failures go back to the session as an answer, not an HTTP error: the
// tool result is what the model reads, and "fix these fields" is something it can
// act on where a refused request is not.
export async function saveOnboardingConfig(
	deps: OnboardingDeps,
	opts: { runId: string; machineId: string; projectId: string; text: string; instructions: string | null }
): Promise<{ ok: true } | { ok: false; issues: ConfigIssue[] }> {
	const run = await getActiveRunForMachine(deps, opts);

	if (run.status !== 'discovering') {
		throw new HttpError(409, 'only a discovery publishes a config');
	}

	// The run's own copy, not the repository's: instructions edited while this run
	// was compiling must leave its config out of date rather than marked current.
	const started = await deps.onboardingRunRepo.getInstructionsById(run.id);
	const instructions = opts.instructions ?? started;
	const text = withInstructionsAsNotes({ config: opts.text, instructions });
	const parsed = parseProjectConfig(text);

	if (!parsed.ok) {
		return { ok: false, issues: parsed.issues };
	}

	const [updated] = await Promise.all([
		deps.onboardingRunRepo.update({ id: run.id, config: text }),
		deps.repositoryRepo.saveConfig({ id: run.repositoryId, config: text, configCompiledFrom: instructions })
	]);
	const repository = await adoptInstructions(deps, { repositoryId: run.repositoryId, projectId: opts.projectId, started, written: opts.instructions });

	if (repository) {
		announceRepository({ socketRegistry: deps.socketRegistry, repository });
	}

	announceOnboarding({ socketRegistry: deps.socketRegistry, projectId: opts.projectId, run: updated ?? run });

	return { ok: true };
}
