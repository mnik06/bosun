import {
	describeToken,
	getClaudeAuthService,
	CLAUDE_TOKEN_VARIABLE
} from '../services/claude-auth.service';
import { getEnvService } from '../services/env.service';
import { getExecService } from '../services/exec.service';
import { getPromptService } from '../services/prompt.service';

const SETUP_HINT =
	'Run `claude setup-token` on your own machine — it needs a browser, this one does not have to.';

const PASTE_HINT =
	'Paste the token, then press Enter on an empty line. A token copied off a wrapped terminal line spans more than one — paste all of it.';

function build() {
	const exec = getExecService();
	const env = getEnvService({ baseEnv: process.env });

	return { env, claudeAuth: getClaudeAuthService({ exec, env }) };
}

export async function setClaudeToken(): Promise<void> {
	const { env, claudeAuth } = build();
	const prompt = getPromptService({});

	console.log(SETUP_HINT);
	console.log(PASTE_HINT);
	console.log('');

	try {
		const token = await prompt.secretBlock('Claude token');

		if (!token) {
			throw new Error('nothing entered — no credential was written');
		}

		// The prompt hides what is typed, so a truncated paste and a good one look
		// identical. Reported back before the check runs, because "the API says your
		// token is invalid" sends people to mint another one when what actually
		// happened is that half of this one never arrived.
		const described = describeToken(token);

		console.log(`Read ${described.fingerprint}.`);

		if (described.warning !== null) {
			console.log(`! ${described.warning}`);
		}

		// Checked before it is written. A credential that the API refuses is a typo
		// or an expired token, and storing it would leave the machine looking
		// configured while every planning session fails.
		console.log('Checking it against the API...');

		const verified = await claudeAuth.verify({ token });

		if (!verified.ok) {
			const suspect =
				described.warning === null ? '' : `\nThe token bosun read is suspect: ${described.warning}.`;

			throw new Error(`${verified.detail}${suspect}\nNothing was written. ${SETUP_HINT}`);
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
