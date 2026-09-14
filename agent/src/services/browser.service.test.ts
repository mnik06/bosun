import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findBrowserExecutable, installDepsCommand, launchBrowser, missingLibrary } from './browser.service';
import { type ExecService } from './exec.service';

const roots: string[] = [];

function cache(files: { path: string; executable?: boolean }[]): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-browser-'));

	roots.push(root);

	for (const file of files) {
		const target = path.join(root, file.path);

		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, '');
		fs.chmodSync(target, file.executable === false ? 0o644 : 0o755);
	}

	return root;
}

function execReturning(result: { ok: boolean; stdout?: string; stderr?: string; reason?: string }): ExecService {
	return {
		run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', reason: '', ...result })
	} as unknown as ExecService;
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('missingLibrary', () => {
	it('names the library the loader gave up on', () => {
		const output =
			'/home/bosun/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell: error while loading shared libraries: libnss3.so: cannot open shared object file: No such file or directory';

		expect(missingLibrary(output)).toBe('libnss3.so');
	});

	it('says nothing for a failure that is not a missing library', () => {
		expect(missingLibrary('[0914/101010.1:FATAL:zygote_host_impl_linux.cc] No usable sandbox!')).toBeNull();
	});
});

describe('findBrowserExecutable', () => {
	it('prefers the headless shell, and the newest revision of it', () => {
		const root = cache([
			{ path: 'chromium-1200/chrome-linux/chrome' },
			{ path: 'chromium_headless_shell-1187/chrome-linux/headless_shell' },
			{ path: 'chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell' }
		]);

		expect(findBrowserExecutable(root)).toBe(
			path.join(root, 'chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell')
		);
	});

	it('falls back to a full chromium build', () => {
		const root = cache([{ path: 'chromium-1187/chrome-linux/chrome' }, { path: 'ffmpeg-1011/ffmpeg-linux' }]);

		expect(findBrowserExecutable(root)).toBe(path.join(root, 'chromium-1187/chrome-linux/chrome'));
	});

	// An interrupted download leaves the directory without a runnable binary, and
	// reporting that as a browser is the failure the launch exists to catch.
	it('ignores a build whose binary is not executable, and a cache that is not there', () => {
		const root = cache([{ path: 'chromium-1187/chrome-linux/chrome', executable: false }]);

		expect(findBrowserExecutable(root)).toBeNull();
		expect(findBrowserExecutable(path.join(root, 'missing'))).toBeNull();
	});
});

describe('installDepsCommand', () => {
	// `sudo` resets PATH, and the agent's node is not on the system one: a bare
	// `sudo npx …` is what an operator pasted and got "command not found" for.
	it('carries the directory of the npx the agent runs with through sudo', () => {
		const toolchain = '/home/bosun/.bosun/toolchains/node-24.15.0/bin';

		expect(
			installDepsCommand({
				pathEnv: ['/home/bosun/.local/bin', toolchain, '/usr/bin'].join(path.delimiter),
				executable: (file) => file === path.join(toolchain, 'npx')
			})
		).toBe(`sudo env "PATH=${toolchain}:$PATH" npx -y playwright install-deps chromium`);
	});

	it('falls back to a plain npx when the agent has none on its PATH', () => {
		expect(installDepsCommand({ pathEnv: '/usr/bin', executable: () => false })).toBe(
			'sudo npx -y playwright install-deps chromium'
		);
	});
});

describe('launchBrowser', () => {
	it('fails with the missing library and the command that installs it', async () => {
		const root = cache([{ path: 'chromium_headless_shell-1187/chrome-linux/headless_shell' }]);
		const result = await launchBrowser({
			cachePath: root,
			exec: execReturning({
				ok: false,
				stderr: 'headless_shell: error while loading shared libraries: libasound.so.2: cannot open shared object file',
				reason: 'exited with 127'
			})
		});

		expect(result).toMatchObject({ ok: false, missingLibrary: 'libasound.so.2' });
		expect(result.detail).toContain('install-deps');
	});

	it('fails on a library ldd cannot resolve even when nothing would load it at launch', async () => {
		const root = cache([{ path: 'chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell' }]);
		const run = vi.fn().mockResolvedValue({
			ok: true,
			stdout: '\tlibc.so.6 => /lib/libc.so.6\n\tlibasound.so.2 => not found\n\tlibnspr4.so => not found\n\tlibasound.so.2 => not found',
			stderr: '',
			reason: ''
		});
		const result = await launchBrowser({ cachePath: root, platform: 'linux', exec: { run } as unknown as ExecService });

		expect(result).toMatchObject({ ok: false, missingLibrary: 'libasound.so.2' });
		expect(result.detail).toContain('libasound.so.2, libnspr4.so are missing');
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('reports no build without trying to launch anything', async () => {
		const exec = execReturning({ ok: true });
		const result = await launchBrowser({ cachePath: cache([]), exec });

		expect(result.ok).toBe(false);
		expect(exec.run).not.toHaveBeenCalled();
	});
});
