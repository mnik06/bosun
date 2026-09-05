import { FastifyLoggerOptions } from 'fastify';

export function getLoggerOptions(): FastifyLoggerOptions {
	const localPrintOpts = {
		transport: {
			target: 'pino-pretty',
			options: {
				translateTime: 'HH:MM:ss.l Z',
				ignore: 'pid,hostname'
			}
		}
	};

	const opts: FastifyLoggerOptions & { redact: string[] } = {
		level: 'trace',
		redact: ['req.headers.authorization'],
		serializers: {
			req(request) {
				return {
					ip: request.ip,
					method: request.method,
					url: request.url,
					path: request.routeOptions.url,
					query: request.query,
					parameters: request.params,
					headers: request.headers
				};
			}
		}
	};

	return process.env.NODE_ENV === 'local' ? { ...localPrintOpts, ...opts } : opts;
}
