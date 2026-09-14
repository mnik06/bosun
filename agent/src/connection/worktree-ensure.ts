import { prepareRunEnvironment } from '../execution/run-environment';
import { type AgentMsg, type ServerMsg } from '../protocol';
import { resolveProjectConfig } from '../services/config-resolution';
import { type Services } from '../services/index';
import { describeApplied } from '../services/project-env.service';

type Ensure = Extract<ServerMsg, { type: 'queue.worktree.ensure' }>;

type Setup = { ok: true; detail: string } | { ok: false; detail: string };

// The backend re-sends an ensure for every queue still provisioning whenever the
// agent announces, and an install can outlast several announces. A second setup
// started in the same worktree would race the first over `node_modules`, and its
// `ready` would release the queue while both were still writing.
const ensuring = new Set<string>();

// A repository machine runs the setup steps of the config it finds in the new
// worktree, in order, with the toolchain that config names. A machine with no
// repository runs its one setup command. Either way a failing step fails the
// queue with the step's name and the tail of its output: a worktree reported
// ready after its install failed is a queue whose every bullet fails an hour in.
async function runSetup(opts: { services: Services; msg: Ensure; worktreePath: string }): Promise<Setup> {
	const { services, msg, worktreePath } = opts;

	if (services.workspace.repositoryId() === null) {
		if (!msg.setupCommand) {
			return { ok: true, detail: 'no setup command' };
		}

		const legacy = await services.setupSteps.runLegacy({
			key: msg.slug,
			worktreePath,
			command: msg.setupCommand,
			env: services.claudeAuth.sessionEnv(),
			onlyChanged: false
		});

		return legacy.ok ? { ok: true, detail: 'setup done' } : { ok: false, detail: legacy.message };
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

	const ran = await services.setupSteps.runAll({
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
	msg: Ensure;
}): Promise<void> {
	const { services, msg } = opts;

	if (ensuring.has(msg.slug)) {
		console.log(`worktree ${msg.slug}: already being set up — that run answers for this request`);

		return;
	}

	ensuring.add(msg.slug);

	try {
		await ensureOnce({ ...opts, services, msg });
	} finally {
		ensuring.delete(msg.slug);
	}
}

async function ensureOnce(opts: {
	services: Services;
	send: (message: AgentMsg) => void;
	msg: Ensure;
}): Promise<void> {
	const { services, msg } = opts;
	const result = await services.worktree.ensure({ slug: msg.slug });

	if (!result.ok) {
		console.log(`worktree ${msg.slug}: ${result.detail}`);
		opts.send({ type: 'queue.worktree.error', queueId: msg.queueId, message: result.detail });

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

	console.log(`worktree ${msg.slug}: ${result.detail}; ${setup.ok ? setup.detail : 'setup failed'}`);
	opts.send(
		setup.ok
			? {
				type: 'queue.worktree.ready',
				queueId: msg.queueId,
				worktreePath: result.worktreePath,
				baseRef: result.baseRef
			}
			: { type: 'queue.worktree.error', queueId: msg.queueId, message: setup.detail }
	);
}
