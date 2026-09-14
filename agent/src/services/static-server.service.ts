import fs from 'fs';
import http from 'http';
import { type AddressInfo, type Socket } from 'net';
import path from 'path';

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain; charset=utf-8',
	'.md': 'text/plain; charset=utf-8'
};

export interface ServedTree {
	url: string;
	close(): Promise<void>;
}

// Git metadata and env files are the two things in a checkout that are not the
// code: one holds remotes and history nobody asked to publish, the other is where
// a machine's values land.
function refused(relative: string): boolean {
	const segments = relative.split(path.sep);

	return segments.includes('.git') || segments.some((segment) => segment.startsWith('.env'));
}

// Checked against the real path, after symlinks, so a link inside the checkout
// cannot hand out a file outside it.
export function resolveInside(root: string, requestUrl: string): string | null {
	let pathname: string;

	try {
		pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
	} catch {
		return null;
	}

	let real: string;

	try {
		real = fs.realpathSync(path.join(root, pathname));
	} catch {
		return null;
	}

	const relative = path.relative(root, real);

	if (relative.startsWith('..') || path.isAbsolute(relative) || refused(relative)) {
		return null;
	}

	const stat = fs.statSync(real);

	if (stat.isDirectory()) {
		const index = path.join(real, 'index.html');

		return fs.existsSync(index) ? index : null;
	}

	return stat.isFile() ? real : null;
}

// A planning session has no shell, so it cannot start the local server a skill or
// a doc tells it to open a page through, and the browser tool refuses `file://`.
// This serves the checkout it reads instead: loopback only, read-only, one per
// session.
export async function serveTree(root: string): Promise<ServedTree> {
	const realRoot = fs.realpathSync(root);
	const sockets = new Set<Socket>();
	const server = http.createServer((req, res) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405).end();

			return;
		}

		const file = resolveInside(realRoot, req.url ?? '/');

		if (file === null) {
			res.writeHead(404).end();

			return;
		}

		res.writeHead(200, {
			'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
			'cache-control': 'no-store'
		});

		if (req.method === 'HEAD') {
			res.end();

			return;
		}

		fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
	});

	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});

	const { port } = server.address() as AddressInfo;

	return {
		url: `http://127.0.0.1:${port}`,
		close: async () =>
			new Promise<void>((resolve) => {
				for (const socket of sockets) {
					socket.destroy();
				}

				server.close(() => resolve());
			})
	};
}
