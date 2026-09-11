import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { browserCachePath, claudeVersionIsSupported, hasBrowserBuild } from './preflight.service';

describe('claudeVersionIsSupported', () => {
	it.each([
		['2.1.39 (Claude Code)', true],
		['3.0.0', true],
		['1.9.9', false]
	])('%s -> %s', (version, expected) => {
		expect(claudeVersionIsSupported(version)).toBe(expected);
	});
});

describe('browserCachePath', () => {
	it.each([
		['linux' as const, path.join('/home/bo', '.cache', 'ms-playwright')],
		['darwin' as const, path.join('/home/bo', 'Library', 'Caches', 'ms-playwright')],
		['win32' as const, path.join('/home/bo', 'AppData', 'Local', 'ms-playwright')]
	])('%s', (platform, expected) => {
		expect(browserCachePath({ platform, home: '/home/bo' })).toBe(expected);
	});

	it('follows PLAYWRIGHT_BROWSERS_PATH when it names a directory', () => {
		expect(
			browserCachePath({ platform: 'linux', home: '/home/bo', configured: '/opt/browsers' })
		).toBe('/opt/browsers');
	});

	// Playwright's own opt-out: the build sits wherever the package was unpacked,
	// so there is no directory to look in and the check must not call that missing.
	it('reports nowhere to look for the package-local layout', () => {
		expect(browserCachePath({ platform: 'linux', home: '/home/bo', configured: '0' })).toBeNull();
	});
});

describe('hasBrowserBuild', () => {
	const made: string[] = [];

	function cacheWith(entries: string[]): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-browsers-'));

		made.push(dir);

		for (const entry of entries) {
			fs.mkdirSync(path.join(dir, entry));
		}

		return dir;
	}

	afterEach(() => {
		for (const dir of made.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('accepts the headless shell on its own', () => {
		expect(hasBrowserBuild(cacheWith(['chromium_headless_shell-1187', 'ffmpeg-1011']))).toBe(true);
	});

	it('accepts a full chromium build', () => {
		expect(hasBrowserBuild(cacheWith(['chromium-1187']))).toBe(true);
	});

	it('rejects a cache holding no browser', () => {
		expect(hasBrowserBuild(cacheWith(['ffmpeg-1011']))).toBe(false);
	});

	it('rejects a cache directory that is not there', () => {
		expect(hasBrowserBuild(path.join(os.tmpdir(), 'bosun-browsers-missing'))).toBe(false);
	});
});
