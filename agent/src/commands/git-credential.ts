import { readConfig } from '../config/config';
import { getBosunApiService } from '../services/bosun-api.service';

// git's credential protocol: `key=value` lines ended by a blank line or EOF.
export function parseCredentialRequest(raw: string): Record<string, string> {
	const fields: Record<string, string> = {};

	for (const line of raw.split('\n')) {
		const index = line.indexOf('=');

		if (line.trim() === '') {
			break;
		}

		if (index > 0) {
			fields[line.slice(0, index)] = line.slice(index + 1).trim();
		}
	}

	return fields;
}

function readStdin(input: NodeJS.ReadableStream): Promise<string> {
	return new Promise((resolve) => {
		let raw = '';

		input.setEncoding('utf8');
		input.on('data', (chunk: string) => {
			raw += chunk;
		});
		input.on('end', () => resolve(raw));
		input.on('error', () => resolve(raw));
	});
}

// The two hosts a machine's clone can ever point at. Azure DevOps accepts any
// non-empty username alongside the PAT, so the same literal answers for both —
// nothing here needs to know which provider the calling repository actually is.
const SUPPORTED_HOSTS = new Set(['github.com', 'dev.azure.com']);

// Called by git, never by a person. Nothing is written to disk and nothing is
// cached here: the backend mints a token for the one repository this machine is
// attached to, and it goes straight into git's pipe. Answering with nothing is
// how a helper says "not mine", so any failure is reported on stderr and git
// carries on to fail the fetch with its own message.
export async function gitCredential(opts: {
	configPath: string;
	operation: string;
	input?: NodeJS.ReadableStream;
	output?: NodeJS.WritableStream;
}): Promise<void> {
	const request = parseCredentialRequest(await readStdin(opts.input ?? process.stdin));

	if (opts.operation !== 'get' || request.protocol !== 'https' || !SUPPORTED_HOSTS.has(request.host)) {
		return;
	}

	// Not gated on `config.repository`: the clone that attaches a repository runs
	// before the config names it, and it needs a token as much as every fetch after.
	// The backend answers from the machine's own row and refuses a machine with none.
	try {
		const config = readConfig(opts.configPath);
		const { token } = await getBosunApiService({
			serverUrl: config.serverUrl,
			machineKey: config.machineKey
		}).gitCredential();

		(opts.output ?? process.stdout).write(`username=x-access-token\npassword=${token}\n\n`);
	} catch (error) {
		console.error(`bosun: no git credential for ${request.host} — ${error instanceof Error ? error.message : 'unknown error'}`);
	}
}
