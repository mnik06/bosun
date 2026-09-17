import crypto from 'crypto';
import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HttpError } from 'src/api/errors/HttpError';
import { handleAzureWebhook } from 'src/controllers/azure/handle-webhook';
import { lineDeps } from 'src/controllers/line/line-deps';

const ParamsSchema = z.object({ repositoryId: z.string() });
const EventTypeSchema = z.object({ eventType: z.string() });

// Compared against whenever no subscription row exists, so the hash comparison
// still runs — a delivery to a repository/event pair with nothing configured
// takes the same code path as a wrong secret, rather than short-circuiting
// before `webhookSecretMatchesHash` and leaking that difference in timing.
const NO_SUBSCRIPTION_HASH = crypto.createHash('sha256').update('bosun-azure-webhook-no-subscription').digest('hex');

// Outside the `azure/` folder on purpose, like `github-webhook.route.ts` is
// outside `github/`: every route there is leader-only, and this one carries no
// bearer token at all. A per-repository URL (AC-58) is what a delivery is
// checked against — a header secret, hashed and compared in constant time
// (AC-56, AC-57) — since Azure has no signature-over-the-body the way GitHub does.
const routes: FastifyPluginAsync = async function (f) {
	const fastify = f.withTypeProvider<ZodTypeProvider>();

	fastify.post('/azure/webhook/:repositoryId', { schema: { params: ParamsSchema } }, async (req, reply) => {
		const repository = await fastify.repos.repositoryRepo.getById(req.params.repositoryId);

		if (!repository || repository.provider !== 'azure_devops') {
			throw new HttpError(404, 'Not found');
		}

		const eventType = EventTypeSchema.safeParse(req.body);

		if (!eventType.success) {
			return reply.status(202).send({ status: 'ignored' });
		}

		const subscription = await fastify.repos.azureWebhookSubscriptionRepo.getForRepositoryAndEvent({
			repositoryId: repository.id,
			eventType: eventType.data.eventType
		});
		const secret = req.headers['x-bosun-azure-secret'];
		const matches =
			typeof secret === 'string' &&
			fastify.services.keyService.webhookSecretMatchesHash({ secret, hash: subscription?.secretHash ?? NO_SUBSCRIPTION_HASH });

		if (!subscription || !matches) {
			throw new HttpError(401, 'Unauthorized');
		}

		await handleAzureWebhook(lineDeps(fastify), { repository, eventType: eventType.data.eventType, payload: req.body });

		return reply.status(202).send({ status: 'accepted' });
	});
};

export default routes;
