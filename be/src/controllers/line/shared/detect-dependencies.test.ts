import { describe, expect, it } from 'vitest';
import {
	consumeInstead,
	detectDependencies,
	type FootprintPlan,
	type ProviderPlan
} from 'src/controllers/line/shared/detect-dependencies';
import { EMPTY_FOOTPRINT, type Footprint } from 'src/types/FootprintSchema';

function footprint(overrides: Partial<Footprint>): Footprint {
	return { ...EMPTY_FOOTPRINT, ...overrides };
}

function plan(opts: { id: string; number: number; slices: Partial<Footprint>[] }): FootprintPlan {
	return {
		planId: opts.id,
		number: opts.number,
		slices: opts.slices.map((entry, index) => ({
			id: `${opts.id}-s${index + 1}`,
			ordinal: index + 1,
			foundation: index === 0,
			footprint: footprint(entry)
		}))
	};
}

function provider(opts: { id: string; number: number; slices: Partial<Footprint>[]; foundationBuilt?: boolean }): ProviderPlan {
	return { ...plan(opts), foundationBuilt: opts.foundationBuilt ?? false };
}

const TIMEZONE = { op: 'add_column' as const, table: 'users', column: 'timezone', definition: 'text not null default \'UTC\'' };

describe('detectDependencies', () => {
	it('depends on the bullet that creates what a plan declares it consumes', () => {
		const avatars = provider({ id: 'p3', number: 3, slices: [{ modules: [{ op: 'create', path: 'fe/app/shared/ui/avatar.tsx', symbol: 'Avatar' }] }, {}] });
		const comments = plan({ id: 'p4', number: 4, slices: [{ consumes: [{ planNumber: 3, item: 'module:fe/app/shared/ui/avatar.tsx#Avatar' }] }] });

		expect(detectDependencies({ candidate: comments, providers: [avatars] }).dependencies).toEqual([
			{ providerPlanId: 'p3', providerSliceId: 'p3-s1', reason: 'uses Avatar in fe/app/shared/ui/avatar.tsx from #3' }
		]);
	});

	// The collision nobody should be asked about: the same column, defined the same
	// way, differing only in how it was typed.
	it('amends an identical creation into a use of the earlier plan, and asks nobody', () => {
		const earlier = provider({ id: 'p7', number: 7, slices: [{ schema: [TIMEZONE] }] });
		const later = plan({ id: 'p9', number: 9, slices: [{ schema: [{ ...TIMEZONE, table: '"users"', definition: 'TEXT  NOT NULL DEFAULT "UTC"' }] }] });
		const detection = detectDependencies({ candidate: later, providers: [earlier] });

		expect(detection.overlaps).toEqual([]);
		expect(detection.amendments).toEqual([
			{ sourcePlanId: 'p7', sliceId: 'p9-s1', key: 'column:users.timezone', text: '`users.timezone` comes from #7 — use it, do not create it' }
		]);
		expect(detection.dependencies).toEqual([{ providerPlanId: 'p7', providerSliceId: 'p7-s1', reason: 'uses users.timezone from #7' }]);
	});

	it('stops on a decision when the definitions differ, and offers changing theirs only while it is unbuilt', () => {
		const later = plan({ id: 'p9', number: 9, slices: [{ schema: [{ ...TIMEZONE, definition: 'varchar(64)' }] }] });
		const unbuilt = detectDependencies({ candidate: later, providers: [provider({ id: 'p7', number: 7, slices: [{ schema: [TIMEZONE] }] })] });
		const built = detectDependencies({ candidate: later, providers: [provider({ id: 'p7', number: 7, slices: [{ schema: [TIMEZONE] }], foundationBuilt: true })] });

		expect(unbuilt.overlaps[0]?.options).toEqual(['use_theirs', 'change_theirs', 'rename']);
		expect(built.overlaps[0]?.options).toEqual(['use_theirs', 'rename']);
		expect(unbuilt.dependencies).toEqual([]);
		expect(unbuilt.amendments).toEqual([]);
	});

	it('depends on the bullet that changes what a plan builds on', () => {
		const invites = provider({
			id: 'p1',
			number: 1,
			slices: [{ schema: [{ op: 'create_table', table: 'invites', definition: '' }] }, { contracts: [{ op: 'change', method: 'post', path: '/invites/{id}', shape: '' }] }]
		});
		const resend = plan({ id: 'p5', number: 5, slices: [{ contracts: [{ op: 'change', method: 'POST', path: '/invites/:inviteId', shape: '' }] }] });

		expect(detectDependencies({ candidate: resend, providers: [invites] }).dependencies).toEqual([
			{ providerPlanId: 'p1', providerSliceId: 'p1-s2', reason: 'builds on the change to POST /invites/{id} from #1' }
		]);
	});

	it('treats a column added to a table another plan creates as using that table', () => {
		const earlier = provider({ id: 'p1', number: 1, slices: [{ schema: [{ op: 'create_table', table: 'invites', definition: '' }] }] });
		const later = plan({ id: 'p2', number: 2, slices: [{ schema: [{ op: 'add_column', table: 'invites', column: 'resent_at', definition: 'timestamptz' }] }] });

		expect(detectDependencies({ candidate: later, providers: [earlier] }).dependencies).toEqual([
			{ providerPlanId: 'p1', providerSliceId: 'p1-s1', reason: 'uses invites from #1' }
		]);
	});

	// Integration handles two plans editing the same file; waiting would only
	// serialise work that merges.
	it('does not make two plans that only touch the same files depend on each other', () => {
		const earlier = provider({ id: 'p1', number: 1, slices: [{ modules: [{ op: 'change', path: 'be/src/users.routes.ts' }] }] });
		const later = plan({ id: 'p2', number: 2, slices: [{ modules: [{ op: 'change', path: 'be/src/users.routes.ts' }] }] });

		expect(detectDependencies({ candidate: later, providers: [earlier] })).toEqual({ dependencies: [], amendments: [], overlaps: [] });
	});

	it('lets the plan approved first own a contested piece', () => {
		const first = provider({ id: 'p1', number: 1, slices: [{ schema: [TIMEZONE] }] });
		const second = provider({ id: 'p2', number: 2, slices: [{ schema: [TIMEZONE] }] });
		const detection = detectDependencies({ candidate: plan({ id: 'p3', number: 3, slices: [{ schema: [TIMEZONE] }] }), providers: [first, second] });

		expect(detection.amendments.map((amendment) => amendment.sourcePlanId)).toEqual(['p1']);
		expect(detection.dependencies.map((dependency) => dependency.providerPlanId)).toEqual(['p1']);
	});
});

describe('consumeInstead', () => {
	it('stops creating the piece and consumes it from the provider', () => {
		const amended = consumeInstead({
			footprint: footprint({ schema: [TIMEZONE, { op: 'create_table', table: 'comments', definition: '' }] }),
			key: 'column:users.timezone',
			providerNumber: 7
		});

		expect(amended.schema).toEqual([{ op: 'create_table', table: 'comments', definition: '' }]);
		expect(amended.consumes).toEqual([{ planNumber: 7, item: 'column:users.timezone' }]);
	});
});
