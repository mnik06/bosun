import { type OverlapChoice, type OverlapItem } from 'src/types/BuildSchema';
import {
	footprintPieces,
	parentKeys,
	type Footprint,
	type FootprintPiece
} from 'src/types/FootprintSchema';

export interface FootprintSlice {
	id: string;
	ordinal: number;
	foundation: boolean;
	footprint: Footprint;
}

export interface FootprintPlan {
	planId: string;
	number: number;
	slices: FootprintSlice[];
}

export interface ProviderPlan extends FootprintPlan {
	// Whether the foundation has already landed: changing its definition then means
	// changing code that exists, so it is no longer offered.
	foundationBuilt: boolean;
}

export interface DetectedDependency {
	providerPlanId: string;
	providerSliceId: string | null;
	reason: string;
}

export interface DetectedAmendment {
	sourcePlanId: string;
	sliceId: string;
	key: string;
	text: string;
}

export interface DetectedOverlap {
	providerPlanId: string;
	sliceId: string;
	item: OverlapItem;
	options: OverlapChoice[];
}

export interface Detection {
	dependencies: DetectedDependency[];
	amendments: DetectedAmendment[];
	overlaps: DetectedOverlap[];
}

interface Located {
	slice: FootprintSlice;
	piece: FootprintPiece;
}

function locate(plan: FootprintPlan): Located[] {
	return plan.slices.flatMap((slice) => footprintPieces(slice.footprint).map((piece) => ({ slice, piece })));
}

// A module change without a symbol is a file being touched, and two plans touching
// the same file do not depend on each other — integration handles that. Only a
// named symbol is a piece one plan can use from another.
function comparable(piece: FootprintPiece): boolean {
	return piece.kind !== 'module' || piece.symbol || piece.creates;
}

function sameDefinition(ours: FootprintPiece, theirs: FootprintPiece): boolean {
	return ours.kind === 'module' || ours.definition === theirs.definition;
}

function uses(ours: FootprintPiece, theirs: FootprintPiece): boolean {
	return theirs.key === ours.key || parentKeys(ours.key).includes(theirs.key);
}

class Collector {
	readonly dependencies = new Map<string, DetectedDependency>();
	readonly amendments: DetectedAmendment[] = [];
	readonly overlaps: DetectedOverlap[] = [];
	readonly claimed = new Set<string>();

	depend(dependency: DetectedDependency): void {
		const key = `${dependency.providerPlanId}:${dependency.providerSliceId ?? '*'}`;

		if (!this.dependencies.has(key)) {
			this.dependencies.set(key, dependency);
		}
	}
}

function consumed(opts: { candidate: FootprintPlan; provider: ProviderPlan; collector: Collector }): void {
	const theirs = locate(opts.provider);
	const foundation = opts.provider.slices.find((slice) => slice.foundation) ?? null;

	for (const slice of opts.candidate.slices) {
		for (const entry of slice.footprint.consumes.filter((piece) => piece.planNumber === opts.provider.number)) {
			const source = theirs.find((located) => located.piece.key === entry.item || parentKeys(entry.item).includes(located.piece.key));

			opts.collector.depend({
				providerPlanId: opts.provider.planId,
				providerSliceId: source?.slice.id ?? foundation?.id ?? null,
				reason: `uses ${source?.piece.label ?? entry.item} from #${opts.provider.number}`
			});
		}
	}
}

function createdTwice(opts: { ours: Located; theirs: Located; provider: ProviderPlan; collector: Collector }): void {
	const { ours, theirs, provider, collector } = opts;

	collector.claimed.add(ours.piece.key);

	if (sameDefinition(ours.piece, theirs.piece)) {
		collector.amendments.push({
			sourcePlanId: provider.planId,
			sliceId: ours.slice.id,
			key: ours.piece.key,
			text: `\`${ours.piece.label}\` comes from #${provider.number} — use it, do not create it`
		});
		collector.depend({
			providerPlanId: provider.planId,
			providerSliceId: theirs.slice.id,
			reason: `uses ${theirs.piece.label} from #${provider.number}`
		});

		return;
	}

	collector.overlaps.push({
		providerPlanId: provider.planId,
		sliceId: ours.slice.id,
		item: {
			key: ours.piece.key,
			kind: ours.piece.kind,
			label: ours.piece.label,
			ours: ours.piece.definition,
			theirs: theirs.piece.definition,
			providerSliceId: theirs.slice.id
		},
		options: provider.foundationBuilt ? ['use_theirs', 'rename'] : ['use_theirs', 'change_theirs', 'rename']
	});
}

function compareWith(opts: { candidate: FootprintPlan; provider: ProviderPlan; collector: Collector }): void {
	const { provider, collector } = opts;
	const theirs = locate(provider).filter((located) => comparable(located.piece));

	consumed(opts);

	for (const ours of locate(opts.candidate).filter((located) => comparable(located.piece))) {
		if (collector.claimed.has(ours.piece.key)) {
			continue;
		}

		const twin = ours.piece.creates
			? theirs.find((located) => located.piece.creates && located.piece.key === ours.piece.key)
			: undefined;

		if (twin) {
			createdTwice({ ours, theirs: twin, provider, collector });

			continue;
		}

		const source = theirs.find((located) => (located.piece.creates || located.piece.changes) && uses(ours.piece, located.piece));

		if (source) {
			collector.depend({
				providerPlanId: provider.planId,
				providerSliceId: source.slice.id,
				reason: `${source.piece.creates ? 'uses' : 'builds on the change to'} ${source.piece.label} from #${provider.number}`
			});
		}
	}
}

// Deterministic, over declared footprints. `providers` are the approved, unmerged
// plans in the candidate's repository, in the order they were approved: whichever
// was approved first owns a contested piece, so a key it settles is not compared
// against any later provider.
export function detectDependencies(opts: { candidate: FootprintPlan; providers: ProviderPlan[] }): Detection {
	const collector = new Collector();

	for (const provider of opts.providers) {
		if (provider.planId !== opts.candidate.planId) {
			compareWith({ candidate: opts.candidate, provider, collector });
		}
	}

	return {
		dependencies: [...collector.dependencies.values()],
		amendments: collector.amendments,
		overlaps: collector.overlaps
	};
}

// The candidate's footprint once an amendment took a piece from another plan: the
// piece is no longer created here, it is consumed.
export function consumeInstead(opts: { footprint: Footprint; key: string; providerNumber: number }): Footprint {
	const keep = (piece: FootprintPiece) => !(piece.creates && piece.key === opts.key);
	const pieces = footprintPieces(opts.footprint);
	const keptSchema = opts.footprint.schema.filter((_, index) => keep(pieces[index]!));
	const contractOffset = opts.footprint.schema.length;
	const keptContracts = opts.footprint.contracts.filter((_, index) => keep(pieces[contractOffset + index]!));
	const moduleOffset = contractOffset + opts.footprint.contracts.length;
	const keptModules = opts.footprint.modules.filter((_, index) => keep(pieces[moduleOffset + index]!));
	const already = opts.footprint.consumes.some((entry) => entry.planNumber === opts.providerNumber && entry.item === opts.key);

	return {
		schema: keptSchema,
		contracts: keptContracts,
		modules: keptModules,
		consumes: already ? opts.footprint.consumes : [...opts.footprint.consumes, { planNumber: opts.providerNumber, item: opts.key }]
	};
}
