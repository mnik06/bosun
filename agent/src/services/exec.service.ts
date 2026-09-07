import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

const EXEC_TIMEOUT_MS = 15_000;

export interface ExecResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	reason: string;
}

// A failed check is read by someone on a box they cannot see, so what the command
// actually said is the entire value of the check. Swallowing the exit code and
// stderr leaves "it failed", which is indistinguishable from every other cause.
function failureReason(error: unknown): string {
	const detail = error as { code?: string | number; signal?: string; stderr?: string };
	const stderr = (detail.stderr ?? '').trim().split('\n').slice(-2).join(' ').slice(-160);

	if (detail.signal === 'SIGTERM') {
		return `timed out after ${EXEC_TIMEOUT_MS / 1000}s`;
	}

	if (detail.code === 'ENOENT') {
		return 'not found on the service PATH';
	}

	return stderr || `exited with ${String(detail.code ?? 'an unknown error')}`;
}

export function getExecService() {
	return {
		async run(
			command: string,
			args: string[],
			opts?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
		): Promise<ExecResult> {
			try {
				const { stdout, stderr } = await exec(command, args, {
					cwd: opts?.cwd,
					env: opts?.env,
					timeout: opts?.timeoutMs ?? EXEC_TIMEOUT_MS
				});

				return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), reason: '' };
			} catch (error) {
				// stdout is kept even on a non-zero exit: a command can report a usable
				// answer and still exit non-zero, and throwing that away turns a readable
				// state into an unexplained failure.
				const detail = error as { stdout?: string; stderr?: string };

				return {
					ok: false,
					stdout: (detail.stdout ?? '').trim(),
					stderr: (detail.stderr ?? '').trim(),
					reason: failureReason(error)
				};
			}
		}
	};
}

export type ExecService = ReturnType<typeof getExecService>;
