import fs from 'fs';
import path from 'path';

let template: string | null = null;

export function getInstallScript(opts: { serverUrl: string; downloadBaseUrl: string }): string {
	template ??= fs.readFileSync(path.join(process.cwd(), 'assets', 'install.sh'), 'utf8');

	return template
		.replaceAll('__BOSUN_SERVER_URL__', opts.serverUrl)
		.replaceAll('__BOSUN_DOWNLOAD_BASE__', opts.downloadBaseUrl);
}
