import { type getDb } from 'src/services/drizzle/drizzle.service';
import { getAzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { getAzureWebhookSubscriptionRepo } from 'src/repos/azure/azure-webhook-subscription.repo';
import { getBugfixMessageRepo } from 'src/repos/builds/bugfix-message.repo';
import { getBugfixSessionRepo } from 'src/repos/builds/bugfix-session.repo';
import { getBuildRepo } from 'src/repos/builds/build.repo';
import { getIntegrationRepo } from 'src/repos/builds/integration.repo';
import { getOverlapDecisionRepo } from 'src/repos/builds/overlap-decision.repo';
import { getPlanAmendmentRepo } from 'src/repos/builds/plan-amendment.repo';
import { getPlanBugRepo } from 'src/repos/builds/plan-bug.repo';
import { getPlanDependencyRepo } from 'src/repos/builds/plan-dependency.repo';
import { getRepositoryMessageRepo } from 'src/repos/builds/repository-message.repo';
import { getSliceRunRepo } from 'src/repos/builds/slice-run.repo';
import { getVerifyFindingRepo } from 'src/repos/builds/verify-finding.repo';
import { getGithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { getGithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { getRepositoryRepo } from 'src/repos/github/repository.repo';
import { getMachineRepo } from 'src/repos/machines/machine.repo';
import { getNotificationRepo } from 'src/repos/notifications/notification.repo';
import { getPushSubscriptionRepo } from 'src/repos/notifications/push-subscription.repo';
import { getOnboardingRunRepo } from 'src/repos/onboarding/onboarding-run.repo';
import { getAcRepo } from 'src/repos/plans/ac.repo';
import { getPlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { getPlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { getPlanRepo } from 'src/repos/plans/plan.repo';
import { getProjectMemberRepo } from 'src/repos/projects/project-member.repo';
import { getProjectRepo } from 'src/repos/projects/project.repo';
import { getQuickFixRepo } from 'src/repos/quick-fixes/quick-fix.repo';
import { getSliceRepo } from 'src/repos/plans/slice.repo';
import { getUserRepo } from 'src/repos/users/user.repo';

export function getRepos(db: ReturnType<typeof getDb>) {
	return {
		acRepo: getAcRepo(db),
		azureConnectionRepo: getAzureConnectionRepo(db),
		azureWebhookSubscriptionRepo: getAzureWebhookSubscriptionRepo(db),
		bugfixMessageRepo: getBugfixMessageRepo(db),
		bugfixSessionRepo: getBugfixSessionRepo(db),
		buildRepo: getBuildRepo(db),
		githubInstallationRepo: getGithubInstallationRepo(db),
		githubPatConnectionRepo: getGithubPatConnectionRepo(db),
		integrationRepo: getIntegrationRepo(db),
		machineRepo: getMachineRepo(db),
		notificationRepo: getNotificationRepo(db),
		onboardingRunRepo: getOnboardingRunRepo(db),
		overlapDecisionRepo: getOverlapDecisionRepo(db),
		planAmendmentRepo: getPlanAmendmentRepo(db),
		planBugRepo: getPlanBugRepo(db),
		planDecisionRepo: getPlanDecisionRepo(db),
		planDependencyRepo: getPlanDependencyRepo(db),
		planMessageRepo: getPlanMessageRepo(db),
		planRepo: getPlanRepo(db),
		projectMemberRepo: getProjectMemberRepo(db),
		projectRepo: getProjectRepo(db),
		pushSubscriptionRepo: getPushSubscriptionRepo(db),
		quickFixRepo: getQuickFixRepo(db),
		repositoryMessageRepo: getRepositoryMessageRepo(db),
		repositoryRepo: getRepositoryRepo(db),
		sliceRunRepo: getSliceRunRepo(db),
		sliceRepo: getSliceRepo(db),
		userRepo: getUserRepo(db),
		verifyFindingRepo: getVerifyFindingRepo(db)
	};
}

export type Repos = ReturnType<typeof getRepos>;
