import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { type EnvSetSummary } from 'src/types/env-sets';
import { type MachineStatus, type PreflightCheck } from 'src/types/MachineSchema';
import {
	type MachinePolicy,
	type OnboardingAssumption,
	type OnboardingPhase,
	type OnboardingRequirement,
	type OnboardingStatus,
	type OnboardingStep
} from 'src/types/OnboardingSchema';
import { type ProjectProfile } from 'src/types/ProjectProfileSchema';
import { type ProjectRole } from 'src/types/ProjectSchema';
import { type PlanSummary } from 'src/types/PlanSummarySchema';
import {
	type PlanMessageContent,
	type PlanMessageRole,
	type PlanQuestion,
	type PlanStatus,
	type SliceKind
} from 'src/types/PlanSchema';
import {
	type BuildStatus,
	type DependencySource,
	type FindingStatus,
	type IntegrationStatus,
	type IntegrationTrigger,
	type NeedsYouReason,
	type OverlapChoice,
	type OverlapItem,
	type Regenerated,
	type RepositoryMessageRole,
	type ResolvedConflict,
	type RunAnswer,
	type RunPhase,
	type SliceRunStatus
} from 'src/types/BuildSchema';
import { type Footprint } from 'src/types/FootprintSchema';
import { type NotificationKind } from 'src/types/NotificationSchema';
import {
	type BugfixMessageContent,
	type BugfixMessageRole,
	type BugfixSessionEndedReason,
	type BugfixSessionStatus,
	type PlanBugStatus
} from 'src/types/BugfixSchema';
import { type QuickFixStatus } from 'src/types/QuickFixSchema';

export const users = pgTable('users', {
	id: text().primaryKey(),
	subId: uuid().notNull().unique(),
	email: text().notNull(),
	// Not a role in `project_members`: it is not scoped to a project, and putting
	// it there would mean writing a row for every project that will ever exist.
	isAppOwner: boolean().notNull().default(false),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

// The unit of ownership. A boundary rather than a workspace: machines, plans and
// queues belong to one, and membership in it is the only thing that grants sight
// of them.
export const projects = pgTable('projects', {
	id: text().primaryKey(),
	name: text().notNull(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

// A row rather than a column on either side, because the pair is the fact and
// neither the project nor the person owns it.
export const projectMembers = pgTable(
	'project_members',
	{
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: text()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text().$type<ProjectRole>().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.projectId, table.userId] }),
		index('project_members_user_id_idx').on(table.userId)
	]
);

// The only GitHub state bosun keeps. No token is stored anywhere: installation
// tokens are minted on demand, and the installing user's token is discarded the
// moment it has proved they can reach this installation.
export const githubInstallations = pgTable(
	'github_installations',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		installationId: bigint({ mode: 'number' }).notNull(),
		accountLogin: text().notNull(),
		createdByUserId: text().references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [unique('github_installations_project_installation_key').on(table.projectId, table.installationId)]
);

// One PAT per organization, project-scoped like `github_installations`. The PAT
// is the only long-lived, non-mintable credential this codebase stores — see
// `pat-encryption.service.md` for why it is encrypted rather than hashed.
export const azureConnections = pgTable(
	'azure_connections',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		organization: text().notNull(),
		encryptedPat: text().notNull(),
		status: text().$type<'active' | 'broken'>().notNull().default('active'),
		lastError: text(),
		brokenAt: timestamp({ withTimezone: true }),
		createdByUserId: text().references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [unique('azure_connections_project_organization_key').on(table.projectId, table.organization)]
);

// The PAT fallback for a GitHub App install a project member cannot get
// approved. Several rows may share a `githubLogin`: a fine-grained token is
// scoped to one organization, so the same person may hold one connection per
// org — there is deliberately no uniqueness constraint on the pair.
export const githubPatConnections = pgTable('github_pat_connections', {
	id: text().primaryKey(),
	projectId: text()
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	githubLogin: text().notNull(),
	tokenType: text().$type<'fine_grained' | 'classic'>().notNull(),
	encryptedToken: text().notNull(),
	status: text().$type<'active' | 'broken'>().notNull().default('active'),
	lastError: text(),
	brokenAt: timestamp({ withTimezone: true }),
	createdByUserId: text().references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

export const repositories = pgTable(
	'repositories',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		provider: text().$type<'github' | 'azure_devops'>().notNull().default('github'),
		installationId: text().references(() => githubInstallations.id, { onDelete: 'cascade' }),
		githubRepoId: bigint({ mode: 'number' }),
		// Mutually exclusive with `installationId` — set when this GitHub repository
		// was attached through a personal access token connection instead of the App.
		githubPatConnectionId: text().references(() => githubPatConnections.id, { onDelete: 'cascade' }),
		// The per-repository webhook bosun created for a PAT-connected repository.
		// Encrypted, not hashed: verifying `X-Hub-Signature-256` needs the plaintext
		// back, unlike Azure's webhook secret which is only ever compared.
		webhookSecretEncrypted: text(),
		githubWebhookId: bigint({ mode: 'number' }),
		// PAT-connected GitHub repositories only — null for an App-connected one
		// (which always has a webhook) and for Azure. Mirrors `azureSyncMode`.
		syncMode: text().$type<'webhook' | 'polling'>(),
		azureConnectionId: text().references(() => azureConnections.id, { onDelete: 'cascade' }),
		azureProjectId: text(),
		// Azure's repository GUID. Stored as text: it is never arithmetic, and every
		// other identifier this table carries for a remote repository is text too.
		azureRepoId: text(),
		fullName: text().notNull(),
		// What the provider calls the default branch, refreshed on every attach.
		defaultBranch: text().notNull(),
		// The branch bosun treats as the default instead, when the provider's is not
		// where the project lives — a bootstrap stub nobody moved on from. Kept apart
		// from `defaultBranch` so a re-attach refreshing that one cannot undo it.
		defaultBranchOverride: text(),
		// Held only until `.bosun/project.yaml` exists on a branch. Validated on write,
		// so a draft that reaches a machine is one the schema accepts.
		configDraft: text(),
		configOnDefault: boolean().notNull().default(false),
		autoResolveConflicts: boolean().notNull().default(true),
		// Azure has no equivalent of a GitHub webhook installation event to announce
		// a first successful sync, so the UI reads this instead — a PAT-connected
		// GitHub repository writes it too, from the same webhook delivery or the
		// sync job's poll. Null for an App-connected GitHub repository.
		lastSyncedAt: timestamp({ withTimezone: true }),
		// Azure only — null for GitHub and for an Azure repository not yet reconciled
		// even once. Set from what attach/reconcile actually achieved with Azure
		// (webhook subscriptions healthy, or refused down to polling), not derived
		// live from it on every read (AC-62, AC-63).
		azureSyncMode: text().$type<'webhook' | 'polling'>(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		unique('repositories_project_github_repo_key').on(table.projectId, table.githubRepoId),
		unique('repositories_project_azure_repo_key').on(table.projectId, table.azureRepoId)
	]
);

// One row per (repository, event type) service hook Azure was asked to create.
// The secret is duplicated across both of a repository's rows rather than kept
// once on the repository: a webhook delivery names only its own subscription id,
// and this is what a delivery is checked against.
export const azureWebhookSubscriptions = pgTable(
	'azure_webhook_subscriptions',
	{
		id: text().primaryKey(),
		repositoryId: text()
			.notNull()
			.references(() => repositories.id, { onDelete: 'cascade' }),
		eventType: text().$type<'git.push' | 'git.pullrequest.updated'>().notNull(),
		azureSubscriptionId: text().notNull(),
		secretHash: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [unique('azure_webhook_subscriptions_repository_event_key').on(table.repositoryId, table.eventType)]
);

export const machines = pgTable(
	'machines',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: text().notNull(),
		enrollmentToken: text().unique(),
		tokenExpiresAt: timestamp({ withTimezone: true }),
		tokenUsedAt: timestamp({ withTimezone: true }),
		machineKeyHash: text(),
		status: text().$type<MachineStatus>().notNull().default('pending'),
		lastSeenAt: timestamp({ withTimezone: true }),
		repoPath: text(),
		agentVersion: text(),
		capabilities: jsonb().$type<PreflightCheck[]>(),
		projectProfile: jsonb().$type<ProjectProfile>(),
		// Key names only. The values stay on the machine and are never written here.
		envSets: jsonb().$type<EnvSetSummary[]>(),
		// A column rather than a join table: one repository per machine is the design.
		// Set when an attach is asked for, so the credential route answers the clone.
		repositoryId: text().references(() => repositories.id, { onDelete: 'set null' }),
		// The repository the agent last said it holds a clone of. `repositoryId` is
		// written the moment an attach is asked for, minutes before the clone lands,
		// so it alone cannot say whether a session has a tree to run in.
		clonedRepositoryId: text().references(() => repositories.id, { onDelete: 'set null' }),
		// The agent's own key, reported in `hello`. What the browser seals values to.
		publicKey: text(),
		policy: jsonb().$type<MachinePolicy>().notNull().default({ applyMigrations: true, confirmed: false }),
		// Names only, for the same reason as `envSets`.
		sessionSecrets: jsonb().$type<string[]>(),
		verifyLanes: integer().notNull().default(1),
		buildCap: integer(),
		// A leader taking the build cap and verify lanes as given: memory stops refusing
		// work here. Sessions keep their per-job limits, so what runs past the budget
		// leans on swap rather than on the kernel's killer.
		ignoreMemoryBudget: boolean().notNull().default(false),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('machines_project_id_idx').on(table.projectId)]
);

// Discovery belongs to a repository and happens once; verify belongs to a
// machine. A run started as one phase keeps its phase and moves through the
// statuses — a discovery that is satisfied becomes that machine's verify.
export const onboardingRuns = pgTable(
	'onboarding_runs',
	{
		id: text().primaryKey(),
		repositoryId: text()
			.notNull()
			.references(() => repositories.id, { onDelete: 'cascade' }),
		machineId: text()
			.notNull()
			.references(() => machines.id, { onDelete: 'cascade' }),
		phase: text().$type<OnboardingPhase>().notNull(),
		status: text().$type<OnboardingStatus>().notNull(),
		portBase: integer(),
		steps: jsonb().$type<OnboardingStep[]>().notNull().default([]),
		requirements: jsonb().$type<OnboardingRequirement[]>().notNull().default([]),
		assumptions: jsonb().$type<OnboardingAssumption[]>().notNull().default([]),
		config: text(),
		// A discovery that found the project on another branch than the default one
		// onboards that branch and says so here; verify waits until it is the
		// repository's default branch in bosun.
		suggestedBaseBranch: text(),
		suggestedBaseBranchReason: text(),
		failureReason: text(),
		startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		finishedAt: timestamp({ withTimezone: true })
	},
	(table) => [
		index('onboarding_runs_repository_id_idx').on(table.repositoryId),
		index('onboarding_runs_machine_id_idx').on(table.machineId)
	]
);

export const plans = pgTable(
	'plans',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		// Who started it, for display only. Nulled rather than cascaded when the
		// person leaves: the plan belongs to the project and outlives them.
		createdByUserId: text().references(() => users.id, { onDelete: 'set null' }),
		machineId: text()
			.notNull()
			.references(() => machines.id, { onDelete: 'cascade' }),
		// A number a person can say out loud. Plans are referred to across machines,
		// in prompts and in blocker lists, and a nanoid is not something anyone can
		// hold in their head or read back to you.
		number: integer().notNull(),
		title: text(),
		bodyMd: text(),
		status: text().$type<PlanStatus>().notNull().default('planning'),
		// Settled when the ticket is pasted, not by the session: whether this plan
		// ends in a verify bullet that drives the feature through its interface.
		verifyInUi: boolean().notNull().default(true),
		// Settled when the ticket is pasted: the grill answers itself instead of
		// stopping for a person who is not there.
		auto: boolean().notNull().default(false),
		// Changeable while the plan builds, and read at each dispatch: its bullets
		// cannot ask, and nothing a fix repaired is driven again before review.
		afk: boolean().notNull().default(false),
		// The person's own sign-off, and the last thing a person does before review.
		// Cleared by a revision from a person or a session, because what was signed
		// off no longer exists — never by a change bosun makes to fit other plans.
		approvedAt: timestamp({ withTimezone: true }),
		// The line the plan joins. Null only for a plan written on a machine with no
		// repository, which can be planned and never approved.
		repositoryId: text().references(() => repositories.id, { onDelete: 'set null' }),
		failureReason: text(),
		input: text().notNull(),
		// Written after the branch lands, by a session that read the diff rather
		// than by the ones that wrote it. Survives a republish: it describes code
		// that exists, not the plan that asked for it.
		summary: jsonb().$type<PlanSummary>(),
		summarisedAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('plans_project_id_idx').on(table.projectId),
		index('plans_machine_id_idx').on(table.machineId),
		index('plans_repository_id_idx').on(table.repositoryId),
		// Unique so two concurrent creates cannot both take max+1 — one loses and
		// retries rather than two plans quietly sharing a number.
		unique('plans_project_number_key').on(table.projectId, table.number)
	]
);

export const planMessages = pgTable(
	'plan_messages',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		seq: integer().notNull(),
		role: text().$type<PlanMessageRole>().notNull(),
		content: jsonb().$type<PlanMessageContent>().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	// The transcript is replayed in `seq` order and appended to concurrently by
	// the stream and by answers, so a duplicate sequence number is a reordered
	// transcript rather than a harmless collision.
	(table) => [unique('plan_messages_plan_seq_key').on(table.planId, table.seq)]
);

export const slices = pgTable(
	'slices',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		ordinal: integer().notNull(),
		kind: text().$type<SliceKind>().notNull().default('build'),
		title: text().notNull(),
		bodyMd: text(),
		foundation: boolean().notNull().default(false),
		footprint: jsonb().$type<Footprint>().notNull().default({ schema: [], contracts: [], modules: [], consumes: [] }),
		changedFiles: jsonb().$type<string[]>()
	},
	(table) => [index('slices_plan_id_idx').on(table.planId)]
);

export const acs = pgTable(
	'acs',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		code: text().notNull(),
		text: text().notNull(),
		// Nulled rather than cascaded when a slice goes, because deleting a slice
		// that still owns an AC is refused: an AC must never be silently dropped
		// along with the bullet that claimed it.
		sliceId: text().references(() => slices.id, { onDelete: 'set null' }),
		ordinal: integer().notNull(),
		// Ticked by the sessions, never by the browser. A build bullet may not
		// finish while one of its criteria is unimplemented — this column is what
		// that refusal is decided from.
		implemented: boolean().notNull().default(false),
		verified: boolean().notNull().default(false),
		// Why this criterion could not be driven. A verify bullet must account for
		// every criterion, but accounting for one is not the same as passing it: an
		// app that will not start is a fact for the reviewer, not a reason to hold
		// the whole branch back. Set means "explained"; null with `verified` false
		// means "silently skipped", which is what the gate still refuses.
		blockedReason: text()
	},
	(table) => [
		index('acs_plan_id_idx').on(table.planId),
		unique('acs_plan_code_key').on(table.planId, table.code)
	]
);

export const builds = pgTable(
	'builds',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		repositoryId: text()
			.notNull()
			.references(() => repositories.id, { onDelete: 'cascade' }),
		// Null until the build takes its first slot: the line belongs to the
		// repository, and any machine attached to it may pick the build up.
		machineId: text().references(() => machines.id, { onDelete: 'set null' }),
		position: integer().notNull(),
		status: text().$type<BuildStatus>().notNull().default('scheduled'),
		needsYouReason: text().$type<NeedsYouReason>(),
		branch: text(),
		baseBranch: text(),
		worktreePath: text(),
		portBase: integer(),
		prNumber: integer(),
		prUrl: text(),
		failureReason: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		startedAt: timestamp({ withTimezone: true }),
		builtAt: timestamp({ withTimezone: true }),
		verifiedAt: timestamp({ withTimezone: true }),
		finishedAt: timestamp({ withTimezone: true }),
		mergedAt: timestamp({ withTimezone: true })
	},
	(table) => [
		index('builds_plan_id_idx').on(table.planId),
		index('builds_repository_id_idx').on(table.repositoryId),
		index('builds_machine_id_idx').on(table.machineId),
		// One build a plan is going somewhere with. Two would be two branches, two
		// worktrees and two pull requests for one piece of work.
		uniqueIndex('builds_live_plan_key')
			.on(table.planId)
			.where(sql`status not in ('merged', 'cancelled')`)
	]
);

export const sliceRuns = pgTable(
	'slice_runs',
	{
		id: text().primaryKey(),
		buildId: text()
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		sliceId: text()
			.notNull()
			.references(() => slices.id, { onDelete: 'cascade' }),
		ordinal: integer().notNull(),
		// Null on a build bullet. A verify slice runs as a drive, a fix, and a
		// re-check of what the fix repaired — each its own run and session.
		phase: text().$type<RunPhase>(),
		status: text().$type<SliceRunStatus>().notNull().default('pending'),
		// The question this run is blocked on, if any. Persisted rather than left in
		// the browser's socket state: a reload used to lose the only control that
		// could answer it, leaving a plan blocked on a session nobody could reach.
		questionId: text(),
		question: jsonb().$type<PlanQuestion[]>(),
		// When it was asked. A question holds its build slot for a while and then
		// gives it up, and this is the clock that decides when.
		questionAskedAt: timestamp({ withTimezone: true }),
		// Written when a question is answered after its session was released: the
		// restarted bullet reads it in its prompt.
		answer: jsonb().$type<RunAnswer>(),
		// The criteria a re-check drives, or a fix-again session is limited to.
		acCodes: jsonb().$type<string[]>(),
		commitSha: text(),
		// What the session said when it finished. The verify bullet is ordered to
		// report a verdict per criterion and it is the only account of what was
		// driven, so it is kept rather than dropped on arrival — the pull request
		// quotes it and a failed gate is unreadable without it.
		report: text(),
		failureReason: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		startedAt: timestamp({ withTimezone: true }),
		finishedAt: timestamp({ withTimezone: true })
	},
	(table) => [index('slice_runs_build_id_idx').on(table.buildId)]
);

// What one plan waits on another for. An edge per piece rather than per pair: a
// plan can use one plan's foundation and a later bullet of it, and each releases
// on its own.
export const planDependencies = pgTable(
	'plan_dependencies',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		providerPlanId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		// Null is the provider's whole feature.
		providerSliceId: text().references(() => slices.id, { onDelete: 'set null' }),
		source: text().$type<DependencySource>().notNull(),
		reason: text().notNull(),
		overriddenByUserId: text().references(() => users.id, { onDelete: 'set null' }),
		overriddenAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('plan_dependencies_plan_id_idx').on(table.planId),
		index('plan_dependencies_provider_plan_id_idx').on(table.providerPlanId)
	]
);

// What bosun changed about a plan to fit the others. A row rather than an edit of
// the body: it does not clear approval, because what the plan delivers is the same.
export const planAmendments = pgTable(
	'plan_amendments',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		sourcePlanId: text().references(() => plans.id, { onDelete: 'set null' }),
		text: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('plan_amendments_plan_id_idx').on(table.planId)]
);

export const overlapDecisions = pgTable(
	'overlap_decisions',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		providerPlanId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		item: jsonb().$type<OverlapItem>().notNull(),
		options: jsonb().$type<OverlapChoice[]>().notNull(),
		chosen: text().$type<OverlapChoice>(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('overlap_decisions_plan_id_idx').on(table.planId)]
);

// What a drive saw go wrong, as rows the fix session resolves one by one. The
// handoff between the two halves of verify is this table.
export const verifyFindings = pgTable(
	'verify_findings',
	{
		id: text().primaryKey(),
		buildId: text()
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		runId: text()
			.notNull()
			.references(() => sliceRuns.id, { onDelete: 'cascade' }),
		acCode: text(),
		kind: text().$type<'criterion' | 'console' | 'network' | 'visual'>().notNull(),
		reproduction: text().notNull(),
		severity: text().$type<'high' | 'medium' | 'low'>().notNull().default('medium'),
		status: text().$type<FindingStatus>().notNull().default('open'),
		note: text(),
		acceptedByUserId: text().references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('verify_findings_build_id_idx').on(table.buildId)]
);

export const integrations = pgTable(
	'integrations',
	{
		id: text().primaryKey(),
		buildId: text()
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		trigger: text().$type<IntegrationTrigger>().notNull(),
		onto: text().notNull(),
		ontoSha: text(),
		status: text().$type<IntegrationStatus>().notNull().default('pending'),
		merged: boolean().notNull().default(false),
		regenerated: jsonb().$type<Regenerated[]>().notNull().default([]),
		resolved: jsonb().$type<ResolvedConflict[]>().notNull().default([]),
		checks: text().$type<'passed' | 'failed' | 'skipped'>(),
		detail: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		startedAt: timestamp({ withTimezone: true }),
		finishedAt: timestamp({ withTimezone: true })
	},
	(table) => [index('integrations_build_id_idx').on(table.buildId)]
);

// A conversation about a repository's line, not a session's transcript. Kept so
// "what happened overnight" survives the process that answered it.
export const repositoryMessages = pgTable(
	'repository_messages',
	{
		id: text().primaryKey(),
		repositoryId: text()
			.notNull()
			.references(() => repositories.id, { onDelete: 'cascade' }),
		role: text().$type<RepositoryMessageRole>().notNull(),
		content: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('repository_messages_repository_id_idx').on(table.repositoryId)]
);

// A browser's Web Push endpoint. One per browser install, not per project: a
// subscription has no project of its own and covers every project the person
// belongs to.
export const pushSubscriptions = pgTable(
	'push_subscriptions',
	{
		id: text().primaryKey(),
		userId: text()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		endpoint: text().notNull().unique(),
		p256dh: text().notNull(),
		auth: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('push_subscriptions_user_id_idx').on(table.userId)]
);

// The persisted record a push is delivered on top of. The system of record: the
// board badge, the needs-you bell and click-to-read are all read from this table,
// and a push notification is a delivery mechanism for the row, not the other way
// round.
export const notifications = pgTable(
	'notifications',
	{
		id: text().primaryKey(),
		userId: text()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		kind: text().$type<NotificationKind>().notNull(),
		title: text().notNull(),
		body: text().notNull(),
		url: text().notNull(),
		planId: text().references(() => plans.id, { onDelete: 'cascade' }),
		sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		readAt: timestamp({ withTimezone: true })
	},
	(table) => [
		index('notifications_user_project_idx').on(table.userId, table.projectId),
		index('notifications_user_plan_idx').on(table.userId, table.planId)
	]
);

// A one-shot bug fix dispatched outside the line entirely: no plan, no board card,
// no ACs, no tracer bullets. Deliberately its own table rather than a `builds` row
// with everything plan-shaped left null — a quick fix has no line to stall, and a
// query against `builds` must never pick one up.
export const quickFixes = pgTable(
	'quick_fixes',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		machineId: text()
			.notNull()
			.references(() => machines.id, { onDelete: 'cascade' }),
		repositoryId: text()
			.notNull()
			.references(() => repositories.id, { onDelete: 'cascade' }),
		branch: text().notNull(),
		baseBranch: text().notNull(),
		description: text().notNull(),
		status: text().$type<QuickFixStatus>().notNull().default('running'),
		prUrl: text(),
		error: text(),
		createdByUserId: text().references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		finishedAt: timestamp({ withTimezone: true })
	},
	(table) => [
		index('quick_fixes_project_id_idx').on(table.projectId),
		index('quick_fixes_machine_id_idx').on(table.machineId)
	]
);

// The claim a bug-fixing session holds on a build's worktree, on the same terms
// `slice_runs`/`integrations` already claim it: at most one row `running` per
// build. The build's own status transition (`in_review` -> `fixing_bugs`) is the
// actual race-guarded gate — this row is the session's history and what
// `report_bugs`/`update_bug_status` are gated against.
export const bugfixSessions = pgTable(
	'bugfix_sessions',
	{
		id: text().primaryKey(),
		buildId: text()
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		status: text().$type<BugfixSessionStatus>().notNull().default('running'),
		endedReason: text().$type<BugfixSessionEndedReason>(),
		startedByUserId: text().references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		endedAt: timestamp({ withTimezone: true })
	},
	(table) => [
		uniqueIndex('bugfix_sessions_running_build_key')
			.on(table.buildId)
			.where(sql`status = 'running'`)
	]
);

// A bug pasted into a bug-fixing session's chat, keyed by build rather than by
// session: a later round's pasted bugs append to the same list, spanning any
// number of sessions on that build. Only a live session's orchestrator writes
// `status` and `note` — there is no API path that sets them directly.
export const planBugs = pgTable(
	'plan_bugs',
	{
		id: text().primaryKey(),
		buildId: text()
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		seq: integer().notNull(),
		description: text().notNull(),
		status: text().$type<PlanBugStatus>().notNull().default('pending'),
		note: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('plan_bugs_build_id_idx').on(table.buildId),
		unique('plan_bugs_build_seq_key').on(table.buildId, table.seq)
	]
);

// A bug-fixing session's transcript, keyed by build on the same terms as
// `plan_bugs`: history persists and appends across any number of sessions.
export const bugfixMessages = pgTable(
	'bugfix_messages',
	{
		id: text().primaryKey(),
		buildId: text()
			.notNull()
			.references(() => builds.id, { onDelete: 'cascade' }),
		seq: integer().notNull(),
		role: text().$type<BugfixMessageRole>().notNull(),
		content: jsonb().$type<BugfixMessageContent>().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [unique('bugfix_messages_build_seq_key').on(table.buildId, table.seq)]
);

// The forks a plan could not settle, resolved while executing it. Kept as rows
// rather than prose in the plan body: the pull request quotes them, the browser
// shows them as they land, and a session that made one cannot quietly revise it
// later.
export const planDecisions = pgTable(
	'plan_decisions',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		fork: text().notNull(),
		options: text(),
		chose: text().notNull(),
		blastRadius: text(),
		reversing: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('plan_decisions_plan_id_idx').on(table.planId)]
);
