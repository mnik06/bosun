import { FastifyPluginAsync } from 'fastify';
import { HttpError } from 'src/api/errors/HttpError';
import { handleGithubWebhook } from 'src/controllers/github/handle-webhook';
import { lineDeps } from 'src/controllers/line/line-deps';
import { verifyWebhookSignature } from 'src/services/github/github-app.service';

// Outside the `github/` folder on purpose: every route there is leader-only, and
// GitHub carries no bearer token. The signature is its credential, checked over
// the raw bytes it sent — which is why this plugin keeps JSON as a buffer.
const routes: FastifyPluginAsync = async function (fastify) {
	fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
		done(null, body);
	});

	fastify.post('/github/webhook', async (request, reply) => {
		const payload = request.body;
		const signature = request.headers['x-hub-signature-256'];

		if (
			!Buffer.isBuffer(payload) ||
			!verifyWebhookSignature({
				secret: fastify.env.GITHUB_WEBHOOK_SECRET,
				payload,
				signature: typeof signature === 'string' ? signature : undefined
			})
		) {
			throw new HttpError(401, 'Unauthorized');
		}

		const event = request.headers['x-github-event'];

		await handleGithubWebhook(lineDeps(fastify), {
			event: typeof event === 'string' ? event : undefined,
			payload: JSON.parse(payload.toString('utf8')) as unknown
		});

		return reply.status(202).send({ status: 'accepted' });
	});
};

export default routes;
