import { getClaudeAuthService, CLAUDE_TOKEN_VARIABLE } from '../services/claude-auth.service';
import { getEnvService } from '../services/env.service';
import { getExecService } from '../services/exec.service';
import { getPromptService } from '../services/prompt.service';

const SETUP_HINT =
	'Run `claude setup-token` on your own machine — it needs a browser, this one does not have to.';

function build() {
	const exec = getExecService();
	const env = getEnvService({ baseEnv: process.env });

	return { env, claudeAuth: getClaudeAuthService({ exec, env }) };
}

export async function setClaudeToken(): Promise<void> {
	const { env, claudeAuth } = build();
	const prompt = getPromptService({});

	console.log(SETUP_HINT);
	console.log('');

	try {
		const token = await prompt.secret('Claude token');

		if (!token) {
			throw new Error('nothing entered — no credential was written');
		}

		// Checked before it is written. A credential that the API refuses is a typo
		// or an expired token, and storing it would leave the machine looking
		// configured while every planning session fails.
		console.log('Checking it against the API...');

		const verified = await claudeAuth.verify({ token });

		if (!verified.ok) {
			throw new Error(`${verified.detail}\nNothing was written. ${SETUP_HINT}`);
		}

		env.set({ variable: CLAUDE_TOKEN_VARIABLE, value: token });

		console.log(`\n✓ ${verified.detail}`);
		console.log(`✓ saved to ${env.envPath}`);
		console.log('\nHit Refresh on this machine in bosun to pick it up.');
	} finally {
		prompt.close();
	}
}

export async function showClaudeAuth(): Promise<void> {
	const { env, claudeAuth } = build();
	const status = await claudeAuth.readStatus();

	console.log(`${env.envPath}: ${env.has(CLAUDE_TOKEN_VARIABLE) ? 'token set' : 'no token'}`);
	console.log(`claude: ${status.detail}`);

	if (!status.loggedIn) {
		console.log(`\n${SETUP_HINT}`);
		console.log('Then: bosun-agent auth set');

		return;
	}

	const verified = await claudeAuth.verify();

	console.log(verified.ok ? `\n✓ ${verified.detail}` : `\n✗ ${verified.detail}`);

	if (!verified.ok) {
		console.log(`\n${SETUP_HINT}`);
		console.log('Then: bosun-agent auth set');
	}
}
