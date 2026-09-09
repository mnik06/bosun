import { FastifyLoggerOptions } from 'fastify';
import { type Env } from 'src/types/EnvSchema';

export function getLoggerOptions(env: Env): FastifyLoggerOptions {
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
		// The generated password is returned in exactly one response and must not be
		// recoverable from a log line afterwards.
		redact: ['req.headers.authorization', 'res.password', 'password'],
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

	return env.NODE_ENV === 'local' ? { ...localPrintOpts, ...opts } : opts;
}
