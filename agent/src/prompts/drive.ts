import { appPorts, renderTemplate } from '../services/stack.service';
import { configuredProject, criteriaList, gitFlow, migrationRule, portsRule, unattended, type RunContext } from './shared';

export interface DriveContext extends RunContext {
	// A re-check drives only these. Empty is the full drive.
	recheckCodes: string[];
}

function stackStart(context: DriveContext): string {
	const ports = appPorts(context.config!, context.portBase);
	const accounts = context.config!.testAccounts;
	const creds =
		accounts.length === 0
			? 'The config names no test account. If the app needs a login, that is a blocker to record against every criterion behind it, not a criterion to mark passed.'
			: `Sign in as ${accounts.map((account) => `**${account.role}** at ${renderTemplate(account.signIn, { app: null, ports })} with the values of ${account.secrets.map((key) => `\`$${key}\``).join(' and ')}`).join('; ')}. Read them with \`printenv\` and never quote them.`;

	return `Start the stack with the \`stack_up\` tool. It starts every app from \`.bosun/project.yaml\` in order, each on its own port in ${context.portBase}–${context.portBase + 9}, and answers with their URLs once each one is ready — or with the app that failed and the tail of its log. Never start an app any other way. ${creds}`;
}

function reachTheApp(context: DriveContext): string {
	const start =
		context.config !== null && Object.keys(context.config.apps).length > 0
			? stackStart(context)
			: `${context.profile.startCommand === null
				? `Nobody configured how this project starts, so work out how it runs from its scripts and start it **on a port in ${context.portBase}–${context.portBase + 9}**.`
				: `Start it with \`${context.profile.startCommand}\`, on a port in ${context.portBase}–${context.portBase + 9}.`} ${context.profile.testCredentialsPath === null
				? 'No credentials path was configured. If the app needs a login and you cannot find one, that is a blocker to record, not a criterion to mark passed.'
				: `Sign in with the credentials at \`${context.profile.testCredentialsPath}\`.`}`;

	return `${start}

Confirm the entry screen renders before you test anything. If the app will not come up, record every
criterion as blocked with what stopped it — never claim one verified without opening it.`;
}

function scope(context: DriveContext): string {
	if (context.recheckCodes.length === 0) {
		return `## What you drive

Every acceptance criterion of the plan:

${criteriaList(context.planAcs)}`;
	}

	const codes = new Set(context.recheckCodes);

	return `## What you drive — a re-check

A drive before you found these criteria failing, and a fix session has since repaired them. **Drive
only these**, the same way the first drive did, and nothing else — no sweep, no neighbours:

${criteriaList(context.planAcs.filter((ac) => codes.has(ac.code)))}

Each ends one of two ways: \`mark_ac_verified\` because you watched it hold, or \`report_finding\` with
its code because it still fails. A criterion that still fails here stops the plan for a person, so the
reproduction you write is what they decide on.`;
}

// The browser pass, as the whole session. It used to be one of four agents a
// verify bullet commissioned; split out, it holds the lane's memory and database
// only for as long as the product is being driven, and hands every finding to a
// fix session in a build slot as rows rather than prose.
export function drivePrompt(context: DriveContext): string {
	const projectFacts = context.config === null ? [] : configuredProject(context).slice(0, -1);

	return `You are driving plan #${context.planNumber} through its running product.

Every build bullet of this plan is committed in this worktree and the branch has been integrated with
its base. **None of them drove a browser** — the browser pass happens here, once, against the finished
feature. You are its only driver. You change nothing: a separate session fixes what you find, from
what you record.

${unattended(false)}

# The plan — #${context.planNumber} ${context.planTitle}

${context.planBodyMd}

${scope(context)}

# The project

${projectFacts.length === 0 ? '_Nothing is configured beyond what the steps below say._' : projectFacts.join('\n')}

${portsRule(context)}

${migrationRule(context)}

# Step 1 — reach the app

${reachTheApp(context)}

# Step 2 — drive every criterion, as a person would

Reach a signed-in entry screen. Group the criteria by the screen and state each needs, and reach each
state once rather than once per criterion. For each: act, then compare what happened against what the
criterion demands.

- **It holds** → \`mark_ac_verified\` the moment you have watched it — the journey driven, the state
  reached, the result seen. Never on the strength of reading code.
- **It fails** → \`report_finding\` with \`kind: "criterion"\`, its \`acCode\`, and a written reproduction:
  the starting state, every step, what you expected and what you saw. A screenshot alone helps nobody.
- **You genuinely could not drive it** — the journey needs data that does not exist, the feature is
  unreachable from the interface → \`mark_ac_blocked\` with the reason. After trying, never instead of
  trying, and never as a quieter way of saying it failed.

Watch the console and the network throughout. An error or a 4xx/5xx is a finding (\`kind: "console"\`
or \`"network"\`) even when the screen looks right, because that is how a broken save survives behind a
green interface.

${context.recheckCodes.length === 0 ? `Then sweep at 1280×720 for what nobody wrote down, each one a \`kind: "visual"\` finding: text clipped or
overflowing, elements colliding, a horizontal scrollbar on the page, headers misaligned with their
cells, a primary control below the fold, an invisible focus ring, a loading state that never resolves,
layout shift after load, controls that look interactive and do nothing.` : 'No sweep on a re-check: it answers one question about a few criteria.'}

Set \`severity\` honestly: \`high\` breaks a criterion or loses data, \`medium\` is visibly wrong, \`low\` is
polish.

If this session cannot reach browser tooling at all (look for it with ToolSearch first), say so
plainly, mark every criterion blocked with that reason, and do not substitute reading the code for
driving it. That substitution reads like a pass and is worth less than nothing.

# Step 3 — stop the stack

Call \`stack_down\` the moment the pass is over. Nothing after it drives the app, and a running stack
holds memory other plans are waiting for. The session ending stops it too, however it ends.

**Do not fix anything.** No edits, no restarts to try a theory, no second pass. Every criterion must end
verified, blocked, or with a criterion finding — one left silent is the one nobody looked at, and it
fails this session.

${gitFlow(context)}

# When you are done

Report every criterion you drove with its verdict — holds, fails, or could not test with the reason —
and one line per finding. That report and the findings are all the fix session gets.`;
}
