import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';

const exec = promisify(execFile);

const UNIT = 'bosun-agent.service';

// Bosun can only reach a machine through a socket the machine opened, so an
// agent that has been revoked has to stop itself. Both callers — a `shutdown`
// frame and a 401 on connect — mean the same thing: the credential is gone and
// will not come back.
export async function terminateSelf(opts: {
	configPath: string;
	reason: string;
}): Promise<never> {
	console.log(`shutting down: ${opts.reason}`);

	// `disable`, not `disable --now`: `--now` stops the unit this process is
	// running inside, racing the rest of this function. Exiting 0 under
	// Restart=on-failure is what stops it; disable is only what keeps it from
	// coming back on the next boot.
	try {
		await exec('systemctl', ['--user', 'disable', UNIT], { timeout: 10_000 });
	} catch {
		console.error(`could not disable ${UNIT} — remove the unit by hand if one exists`);
	}

	try {
		fs.rmSync(opts.configPath, { force: true });
	} catch {
		console.error(`could not remove ${opts.configPath} — delete it by hand`);
	}

	console.log('bosun agent stopped. Re-enrolling needs terminal access to this machine.');
	process.exit(0);
}
