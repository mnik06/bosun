import { prepareRunEnvironment } from '../execution/run-environment';
import { type AgentMsg, type BuildWorktreeEnsure } from '../protocol';
import { resolveProjectConfig } from '../services/config-resolution';
import { type Services } from '../services/index';
import { describeApplied } from '../services/project-env.service';

type Setup = { ok: true; detail: string } | { ok: false; detail: string };

// The backend sends an ensure every time a build takes a slot, and an install can
// outlast a reconnect that re-sends it. A second setup started in the same
// worktree would race the first over `node_modules`, and its `ready` would release
// the build while both were still writing.
const ensuring = new Set<string>();

// The setup steps of the config the build's own branch carries, in order, with the
// toolchain that config names. Run after the branch is cut, so a provider that
// added a dependency is installed before the first bullet rather than found
// missing an hour into it. A failing step fails the build with the step's name and
// the tail of its output.
async function runSetup(opts: { services: Services; msg: BuildWorktreeEnsure; worktreePath: string }): Promise<Setup> {
	const { services, msg, worktreePath } = opts;

	if (services.workspace.repositoryId() === null) {
		return { ok: true, detail: 'no repository attached — nothing to set up' };
	}

	const resolved = resolveProjectConfig({ treePath: worktreePath, draft: msg.configDraft });

	if (resolved.source === 'invalid') {
		return { ok: false, detail: resolved.detail };
	}

	if (resolved.source === 'none') {
		return { ok: true, detail: 'no config yet — nothing to set up' };
	}

	const environment = await prepareRunEnvironment({ services, config: resolved.config, includeSecrets: false });

	if (!environment.ok) {
		return environment;
	}

	const ran = await (msg.fresh ? services.setupSteps.runAll : services.setupSteps.rerunChanged)({
		key: msg.slug,
		worktreePath,
		config: resolved.config,
		env: environment.env,
		onStep: (name) => console.log(`worktree ${msg.slug}: setup step ${name}`)
	});

	return ran.ok
		? { ok: true, detail: `${ran.ran.length} setup step(s) from the ${resolved.source}` }
		: { ok: false, detail: ran.message };
}

export async function ensureWorktree(opts: {
	services: Services;
	send: (message: AgentMsg) => void;
	msg: BuildWorktreeEnsure;
}): Promise<void> {
	const { msg } = opts;

	if (ensuring.has(msg.slug)) {
		console.log(`worktree ${msg.slug}: already being set up — that run answers for this request`);

		return;
	}

	ensuring.add(msg.slug);

	try {
		await ensureOnce(opts);
	} finally {
		ensuring.delete(msg.slug);
	}
}

async function ensureOnce(opts: {
	services: Services;
	send: (message: AgentMsg) => void;
	msg: BuildWorktreeEnsure;
}): Promise<void> {
	const { services, msg } = opts;
	const fail = (message: string) => {
		console.log(`worktree ${msg.slug}: ${message}`);
		opts.send({ type: 'build.worktree.error', buildId: msg.buildId, message });
	};
	const result = await services.worktree.ensure({ slug: msg.slug });

	if (!result.ok) {
		fail(result.detail);

		return;
	}

	const branched = await services.commit.startBuildBranch({
		worktreePath: result.worktreePath,
		branch: msg.branch,
		baseRef: result.baseRef,
		fresh: msg.fresh,
		startFrom: msg.startFrom,
		mergeIn: msg.mergeIn
	});

	if (!branched.ok) {
		fail(branched.detail);

		return;
	}

	// Before the setup, so a step that migrates or generates a client runs against
	// the real service. Logged rather than fatal: every bullet writes the files
	// again and fails there, with the reason, where it is seen.
	try {
		const applied = describeApplied(services.projectEnv.applyTo(result.worktreePath));

		if (applied !== null) {
			console.log(`worktree ${msg.slug}: ${applied}`);
		}
	} catch (error) {
		console.error(
			`worktree ${msg.slug}: ${error instanceof Error ? error.message : 'could not write the provided env files'}`
		);
	}

	const setup = await runSetup({ services, msg, worktreePath: result.worktreePath });

	if (!setup.ok) {
		fail(setup.detail);

		return;
	}

	const head = await services.exec.run('git', ['-C', result.worktreePath, 'rev-parse', 'HEAD'], { timeoutMs: 30_000 });

	console.log(`worktree ${msg.slug}: ${result.detail}; ${branched.detail}; ${setup.detail}`);
	opts.send({
		type: 'build.worktree.ready',
		buildId: msg.buildId,
		worktreePath: result.worktreePath,
		baseRef: result.baseRef,
		headSha: head.ok && head.stdout !== '' ? head.stdout : null
	});
}
