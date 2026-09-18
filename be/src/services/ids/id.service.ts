import { nanoid } from 'nanoid';

export function getIdService() {
	return {
		createMachineId: (): string => `m_${nanoid(12)}`,
		createCommandId: (): string => `cmd_${nanoid(12)}`,
		createUserId: (): string => `u_${nanoid(12)}`,
		createProjectId: (): string => `prj_${nanoid(12)}`,
		createPlanId: (): string => `p_${nanoid(12)}`,
		createPlanMessageId: (): string => `pm_${nanoid(12)}`,
		createAcId: (): string => `ac_${nanoid(12)}`,
		createSliceId: (): string => `sl_${nanoid(12)}`,
		createPlanDecisionId: (): string => `pd_${nanoid(12)}`,
		createSliceRunId: (): string => `sr_${nanoid(12)}`,
		createGithubInstallationId: (): string => `ghi_${nanoid(12)}`,
		createAzureConnectionId: (): string => `azc_${nanoid(12)}`,
		createAzureWebhookSubscriptionId: (): string => `azwh_${nanoid(12)}`,
		createRepositoryId: (): string => `repo_${nanoid(12)}`,
		createOnboardingRunId: (): string => `onb_${nanoid(12)}`,
		createBuildId: (): string => `bld_${nanoid(12)}`,
		createDependencyId: (): string => `dep_${nanoid(12)}`,
		createAmendmentId: (): string => `am_${nanoid(12)}`,
		createOverlapDecisionId: (): string => `ovd_${nanoid(12)}`,
		createFindingId: (): string => `vf_${nanoid(12)}`,
		createIntegrationId: (): string => `int_${nanoid(12)}`,
		createRepositoryMessageId: (): string => `rm_${nanoid(12)}`,
		createPushSubscriptionId: (): string => `psub_${nanoid(12)}`,
		createNotificationId: (): string => `ntf_${nanoid(12)}`,
		createBugfixSessionId: (): string => `bfs_${nanoid(12)}`,
		createPlanBugId: (): string => `bug_${nanoid(12)}`,
		createBugfixMessageId: (): string => `bfm_${nanoid(12)}`,
		createQuickFixId: (): string => `qf_${nanoid(12)}`
	};
}

export type IdService = ReturnType<typeof getIdService>;
