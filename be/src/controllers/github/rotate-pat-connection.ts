import { HttpError } from 'src/api/errors/HttpError';
import { toGithubPatHttpError } from 'src/controllers/github/shared/github-pat-errors';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubPatService } from 'src/services/github/github-pat.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';

// Validated the same way a new connection is (AC-17), and refused if the
// replacement token belongs to a different GitHub login than the one this
// connection was created for — that is a different identity, not a rotation of
// this one, and the picker's "Personal token · {githubLogin}" label would
// otherwise go stale silently.
export async function rotateGithubPatConnection(opts: {
	githubPatConnectionRepo: GithubPatConnectionRepo;
	githubPat: GithubPatService;
	patEncryption: PatEncryptionService;
	id: string;
	projectId: string;
	pat: string;
}): Promise<GithubPatConnection> {
	const connection = await opts.githubPatConnectionRepo.getOwnedById({ id: opts.id, projectId: opts.projectId });

	if (!connection) {
		throw new HttpError(404, 'GitHub token connection not found');
	}

	const validated = await opts.githubPat.validateAndListRepositories({ pat: opts.pat }).catch((error: unknown) => {
		throw toGithubPatHttpError(error);
	});

	if (validated.githubLogin !== connection.githubLogin) {
		throw new HttpError(422, `This token belongs to ${validated.githubLogin}, not ${connection.githubLogin} — connect it as a separate token instead`);
	}

	const rotated = await opts.githubPatConnectionRepo.rotateToken({
		id: connection.id,
		projectId: opts.projectId,
		githubLogin: validated.githubLogin,
		tokenType: validated.tokenType,
		encryptedToken: opts.patEncryption.encrypt(opts.pat)
	});

	return rotated ?? connection;
}
