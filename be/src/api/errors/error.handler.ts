import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';

export function errorHandler(error: FastifyError, req: FastifyRequest, reply: FastifyReply) {
	req.log.error(error);

	const deliberate = error instanceof HttpError;
	const statusCode = deliberate ? error.statusCode : error.statusCode ?? 500;
	// Only an unplanned 5xx is collapsed: a message we wrote ourselves cannot
	// leak internals, and the client needs it to tell "retry later" from "your
	// request was wrong".
	const message = deliberate || statusCode < 500 ? error.message : 'Internal server error';

	return reply.status(statusCode).send({ message });
}
