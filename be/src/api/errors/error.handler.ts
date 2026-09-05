import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';

export function errorHandler(error: FastifyError, req: FastifyRequest, reply: FastifyReply) {
	req.log.error(error);

	const statusCode = error instanceof HttpError ? error.statusCode : error.statusCode ?? 500;
	const message = statusCode >= 500 ? 'Internal server error' : error.message;

	return reply.status(statusCode).send({ message });
}
