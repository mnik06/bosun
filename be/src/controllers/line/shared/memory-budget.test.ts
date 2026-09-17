import { describe, expect, it } from 'vitest';
import {
	admit,
	admitOnboarding,
	BUILD_BYTES,
	holderBlocksLane,
	LANE_BYTES,
	usableBytes,
	type MachineLoad
} from 'src/controllers/line/shared/memory-budget';
import { type MachineMemory } from 'src/types/machine-memory';

const GIB = 1024 ** 3;

function box(totalGib: number, swapGib = 0): MachineMemory {
	return { totalBytes: totalGib * GIB, availableBytes: totalGib * GIB, swapTotalBytes: swapGib * GIB, sessionLimits: true };
}

function load(overrides: Partial<MachineLoad> = {}): MachineLoad {
	return { build: 0, lane: 0, onboarding: 0, quickFix: 0, ...overrides };
}

const BASE = { verifyLanes: 1, verifyWaiting: false, buildCap: null };

describe('usableBytes', () => {
	it('counts swap for half and keeps the reserve back', () => {
		expect(usableBytes(box(8, 2))).toBe(7.5 * GIB);
	});
});

describe('holderBlocksLane', () => {
	const LANE = { verifyLanes: 1, buildCap: null };

	it('is the holder when a drive fits only without it', () => {
		expect(holderBlocksLane({ ...LANE, memory: box(7.5), load: load({ build: 1 }) })).toBe(true);
	});

	it('is not when the drive fits beside it', () => {
		expect(holderBlocksLane({ ...LANE, memory: box(16), load: load({ build: 1 }) })).toBe(false);
	});

	it('is not when giving up one slot still leaves the drive out', () => {
		expect(holderBlocksLane({ ...LANE, memory: box(10), load: load({ build: 2 }) })).toBe(false);
	});

	it('is not when the lane is taken or there is none', () => {
		expect(holderBlocksLane({ ...LANE, memory: box(7.5), load: load({ build: 1, lane: 1 }) })).toBe(false);
		expect(holderBlocksLane({ verifyLanes: 0, buildCap: null, memory: box(7.5), load: load({ build: 1 }) })).toBe(false);
	});
});

describe('admit', () => {
	// 16 GB less the reserve is 14.5 GiB: four build slots, or three beside a drive.
	const sixteen = box(16);

	it('lends the lane to builds while nothing waits to verify', () => {
		expect(admit({ ...BASE, memory: sixteen, jobClass: 'build', load: load({ build: 3 }) })).toEqual({
			admitted: true,
			limitBytes: BUILD_BYTES
		});
	});

	// The fix for a plan waiting on a lane nobody gives back: once it waits, no new
	// bullet may start in the reservation.
	it('keeps the lane free once a plan waits to verify', () => {
		expect(
			admit({ ...BASE, memory: sixteen, jobClass: 'build', load: load({ build: 2 }), verifyWaiting: true }).admitted
		).toBe(false);
		expect(
			admit({ ...BASE, memory: sixteen, jobClass: 'build', load: load({ build: 1 }), verifyWaiting: true }).admitted
		).toBe(true);
	});

	it('counts a running drive against the reservation rather than on top of it', () => {
		expect(
			admit({ ...BASE, memory: sixteen, jobClass: 'build', load: load({ build: 1, lane: 1 }), verifyWaiting: true })
		).toEqual({ admitted: true, limitBytes: BUILD_BYTES });
	});

	it('admits a drive into memory builds are not holding', () => {
		expect(admit({ ...BASE, memory: sixteen, jobClass: 'lane', load: load({ build: 2 }) })).toEqual({
			admitted: true,
			limitBytes: LANE_BYTES
		});
		expect(admit({ ...BASE, memory: sixteen, jobClass: 'lane', load: load({ build: 3 }) }).admitted).toBe(false);
	});

	it('runs one drive per lane', () => {
		expect(admit({ ...BASE, memory: box(64), jobClass: 'lane', load: load({ lane: 1 }) }).admitted).toBe(false);
		expect(admit({ ...BASE, memory: box(64), jobClass: 'lane', load: load({ lane: 1 }), verifyLanes: 2 }).admitted).toBe(true);
	});

	it('holds a leader cap below what memory admits', () => {
		expect(admit({ ...BASE, memory: box(64), jobClass: 'build', load: load({ build: 2 }), buildCap: 2 }).admitted).toBe(false);
	});

	it('always takes a job on an idle machine, however small', () => {
		expect(admit({ ...BASE, memory: box(4), jobClass: 'lane', load: load() })).toEqual({
			admitted: true,
			limitBytes: 2.5 * GIB
		});
	});

	it('admits without a limit when the machine has not reported memory', () => {
		expect(admit({ ...BASE, memory: null, jobClass: 'build', load: load({ build: 9 }) })).toEqual({
			admitted: true,
			limitBytes: null
		});
	});
});

describe('admit — quickFix', () => {
	const sixteen = box(16);

	it('sizes a quick fix like a build, not a lane', () => {
		expect(admit({ ...BASE, memory: sixteen, jobClass: 'quickFix', load: load() })).toEqual({
			admitted: true,
			limitBytes: BUILD_BYTES
		});
	});

	it('counts a running build and a running quick fix as two build-sized jobs', () => {
		// 14.5 GiB usable: room for four build-sized jobs, not five.
		expect(admit({ ...BASE, memory: sixteen, jobClass: 'quickFix', load: load({ build: 4 }) }).admitted).toBe(false);
		expect(admit({ ...BASE, memory: sixteen, jobClass: 'quickFix', load: load({ build: 3 }) }).admitted).toBe(true);
		expect(admit({ ...BASE, memory: sixteen, jobClass: 'build', load: load({ quickFix: 4 }) }).admitted).toBe(false);
	});

	it('is never gated by the leader cap — that ceiling counts plans, not quick fixes', () => {
		expect(admit({ ...BASE, memory: sixteen, jobClass: 'quickFix', load: load({ build: 2 }), buildCap: 2 }).admitted).toBe(true);
	});
});

describe('admitOnboarding', () => {
	it('is held to what the line leaves', () => {
		expect(admitOnboarding({ memory: box(16), load: load({ build: 3 }) }).admitted).toBe(false);
		expect(admitOnboarding({ memory: box(16), load: load({ build: 2 }) }).admitted).toBe(true);
	});
});
