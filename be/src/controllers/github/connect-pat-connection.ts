import { toGithubPatHttpError } from 'src/controllers/github/shared/github-pat-errors';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubPatService } from 'src/services/github/github-pat.service';
import { type IdService } from 'src/services/ids/id.service';
import { type GithubPatConnection } from 'src/types/GithubPatSchema';

// Validated before it is ever written: the token is asked who it belongs to and
// what it can push to, and the connection is persisted only if both calls
// succeed (AC-3, AC-4, AC-5). Unlike Azure's one-per-organization connection,
// nothing here refuses a second connection for the same GitHub login — a
// fine-grained token is scoped to one organization, so the same person may hold
// more than one.
export async function connectGithubPatConnection(opts: {
	githubPatConnectionRepo: GithubPatConnectionRepo;
	githubPat: GithubPatService;
	patEncryption: PatEncryptionService;
	idService: IdService;
	userId: string;
	projectId: string;
	pat: string;
}): Promise<GithubPatConnection> {
	const validated = await opts.githubPat.validateAndListRepositories({ pat: opts.pat }).catch((error: unknown) => {
		throw toGithubPatHttpError(error);
	});

	return opts.githubPatConnectionRepo.create({
		id: opts.idService.createGithubPatConnectionId(),
		projectId: opts.projectId,
		githubLogin: validated.githubLogin,
		tokenType: validated.tokenType,
		encryptedToken: opts.patEncryption.encrypt(opts.pat),
		createdByUserId: opts.userId
	});
}
