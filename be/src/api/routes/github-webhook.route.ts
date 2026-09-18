import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HttpError } from 'src/api/errors/HttpError';
import { handleGithubWebhook } from 'src/controllers/github/handle-webhook';
import { lineDeps } from 'src/controllers/line/line-deps';
import { verifyWebhookSignature } from 'src/services/github/github-app.service';

const RepositoryIdParamsSchema = z.object({ repositoryId: z.string() });

// Shared by both the App-wide route and the per-repository PAT one below: verify
// the signature over the raw bytes GitHub sent, then hand the parsed payload to
// the same fan-out-by-`githubRepoId` handler either way — the secret is what
// authenticates the delivery, not a second code path for what happens next.
async function verifyAndHandle(opts: { request: FastifyRequest; reply: FastifyReply; deps: ReturnType<typeof lineDeps>; secret: string | null }) {
	const payload = opts.request.body;
	const signature = opts.request.headers['x-hub-signature-256'];

	if (
		opts.secret === null ||
		!Buffer.isBuffer(payload) ||
		!verifyWebhookSignature({ secret: opts.secret, payload, signature: typeof signature === 'string' ? signature : undefined })
	) {
		throw new HttpError(401, 'Unauthorized');
	}

	const event = opts.request.headers['x-github-event'];

	await handleGithubWebhook(opts.deps, {
		event: typeof event === 'string' ? event : undefined,
		payload: JSON.parse(payload.toString('utf8')) as unknown
	});

	return opts.reply.status(202).send({ status: 'accepted' });
}

// Outside the `github/` folder on purpose: every route there is leader-only, and
// GitHub carries no bearer token either. The signature is its credential, checked over
// the raw bytes it sent — which is why this plugin keeps JSON as a buffer.
const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
		done(null, body);
	});

	fastify.post('/github/webhook', async (request, reply) => {
		return verifyAndHandle({ request, reply, deps: lineDeps(fastify), secret: fastify.env.GITHUB_WEBHOOK_SECRET });
	});

	// The PAT fallback's own delivery URL, one per repository, since a PAT
	// connection has no App-wide secret the way `GITHUB_WEBHOOK_SECRET` is.
	// `src/controllers/github/shared/webhook.ts` is what creates and reconciles
	// these webhooks; this is the intake side alone, refusing anything that is
	// not a PAT-connected repository with a secret already on it.
	fastify.post('/github/webhook/:repositoryId', { schema: { params: RepositoryIdParamsSchema } }, async (request, reply) => {
		const repository = await fastify.repos.repositoryRepo.getById(request.params.repositoryId);

		if (!repository || repository.provider !== 'github' || repository.githubPatConnectionId === null) {
			throw new HttpError(401, 'Unauthorized');
		}

		const encryptedSecret = await fastify.repos.repositoryRepo.getWebhookSecretEncryptedById(repository.id);

		return verifyAndHandle({
			request,
			reply,
			deps: lineDeps(fastify),
			secret: encryptedSecret === null ? null : fastify.services.patEncryption.decrypt(encryptedSecret)
		});
	});
};

export default routes;
