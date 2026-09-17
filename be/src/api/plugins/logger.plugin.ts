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
		// recoverable from a log line afterwards. The same containment for the Azure
		// and GitHub PAT a connect/rotate request body carries (AC-21, AC-68) — never
		// logged, in memory only for the moment it is validated and encrypted. The
		// per-repository GitHub webhook secret this plan adds is never part of any
		// request or response body (bosun generates it), but is redacted the same way
		// in case a future log statement ever carries it.
		redact: ['req.headers.authorization', 'res.password', 'password', 'req.body.pat', 'pat', 'webhookSecret'],
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
