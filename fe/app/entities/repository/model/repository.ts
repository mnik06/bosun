import { z } from 'zod'

export const GithubInstallationSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	installationId: z.number(),
	accountLogin: z.string(),
	createdByUserId: z.string().nullable(),
	createdAt: z.iso.datetime()
})

export type GithubInstallation = z.infer<typeof GithubInstallationSchema>

export const AzureConnectionStatusSchema = z.enum(['active', 'broken'])

export type AzureConnectionStatus = z.infer<typeof AzureConnectionStatusSchema>

export const AzureConnectionSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	organization: z.string(),
	status: AzureConnectionStatusSchema,
	lastError: z.string().nullable(),
	brokenAt: z.iso.datetime().nullable(),
	createdByUserId: z.string().nullable(),
	createdAt: z.iso.datetime()
})

export type AzureConnection = z.infer<typeof AzureConnectionSchema>

export const RepositoryProviderSchema = z.enum(['github', 'azure_devops'])

export type RepositoryProvider = z.infer<typeof RepositoryProviderSchema>

export const RepositorySchema = z.object({
	id: z.string(),
	projectId: z.string(),
	provider: RepositoryProviderSchema,
	installationId: z.string().nullable(),
	githubRepoId: z.number().nullable(),
	azureConnectionId: z.string().nullable(),
	azureProjectId: z.string().nullable(),
	azureRepoId: z.string().nullable(),
	fullName: z.string(),
	// The branch bosun treats as the default: the override when one is set.
	defaultBranch: z.string(),
	// Nullish: a backend older than base-branch overrides omits both.
	providerDefaultBranch: z.string().nullish(),
	defaultBranchOverride: z.string().nullish(),
	configDraft: z.string().nullable(),
	configOnDefault: z.boolean(),
	autoResolveConflicts: z.boolean(),
	lastSyncedAt: z.iso.datetime().nullable(),
	azureSyncMode: z.enum(['webhook', 'polling']).nullable(),
	createdAt: z.iso.datetime()
})

export type Repository = z.infer<typeof RepositorySchema>

export const RepositoryMessageSchema = z.object({
	id: z.string(),
	repositoryId: z.string(),
	role: z.enum(['user', 'assistant']),
	content: z.string(),
	createdAt: z.iso.datetime()
})

export type RepositoryMessage = z.infer<typeof RepositoryMessageSchema>

export const AvailableRepositorySchema = z.object({
	githubRepoId: z.number(),
	fullName: z.string(),
	defaultBranch: z.string(),
	private: z.boolean(),
	installationId: z.string()
})

export type AvailableRepository = z.infer<typeof AvailableRepositorySchema>

export const AvailableAzureRepositorySchema = z.object({
	azureConnectionId: z.string(),
	organization: z.string(),
	azureProjectId: z.string(),
	azureProjectName: z.string(),
	azureRepoId: z.string(),
	fullName: z.string(),
	defaultBranch: z.string(),
	cloneUrl: z.string(),
	private: z.boolean()
})

export type AvailableAzureRepository = z.infer<typeof AvailableAzureRepositorySchema>

export const OnboardingStatusSchema = z.enum(['discovering', 'needs_input', 'verifying', 'ready', 'failed'])

export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>

export const OnboardingPhaseSchema = z.enum(['discover', 'verify'])

export type OnboardingPhase = z.infer<typeof OnboardingPhaseSchema>

export const OnboardingStepSchema = z.object({
	label: z.string(),
	status: z.enum(['info', 'running', 'passed', 'failed']),
	detail: z.string().nullable(),
	// Defaulted: steps recorded before progress existed carry none.
	progress: z.number().nullable().default(null),
	at: z.string()
})

export type OnboardingStep = z.infer<typeof OnboardingStepSchema>

export const OnboardingRequirementSchema = z.object({
	kind: z.enum(['env', 'secret', 'policy']),
	path: z.string().nullable(),
	key: z.string(),
	why: z.string(),
	evidence: z.string(),
	optional: z.boolean().default(false)
})

export type OnboardingRequirement = z.infer<typeof OnboardingRequirementSchema>

export const OnboardingAssumptionSchema = z.object({
	text: z.string(),
	evidence: z.string()
})

export type OnboardingAssumption = z.infer<typeof OnboardingAssumptionSchema>

export const OnboardingRunSchema = z.object({
	id: z.string(),
	repositoryId: z.string(),
	machineId: z.string(),
	phase: OnboardingPhaseSchema,
	status: OnboardingStatusSchema,
	portBase: z.number().nullable(),
	steps: z.array(OnboardingStepSchema),
	requirements: z.array(OnboardingRequirementSchema),
	assumptions: z.array(OnboardingAssumptionSchema),
	config: z.string().nullable(),
	// Nullish for the same reason as the repository's override fields.
	suggestedBaseBranch: z.string().nullish(),
	suggestedBaseBranchReason: z.string().nullish(),
	failureReason: z.string().nullable(),
	startedAt: z.iso.datetime(),
	finishedAt: z.iso.datetime().nullable()
})

export type OnboardingRun = z.infer<typeof OnboardingRunSchema>

export const MachineOnboardingSchema = z.object({
	run: OnboardingRunSchema,
	missing: z.array(OnboardingRequirementSchema)
})

export type MachineOnboarding = z.infer<typeof MachineOnboardingSchema>

export const RepositoryConfigSchema = z.object({
	defaultBranch: z.string(),
	file: z.string().nullable(),
	draft: z.string().nullable(),
	source: z.enum(['file', 'draft', 'none'])
})

export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>
