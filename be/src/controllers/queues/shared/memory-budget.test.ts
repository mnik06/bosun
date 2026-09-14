import { describe, expect, it } from 'vitest';
import {
	admitBullet,
	BULLET_BYTES,
	RESERVED_BYTES,
	usableBytes
} from 'src/controllers/queues/shared/memory-budget';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

// The machine this was built for: 7.6 GB of RAM and no swap.
const SMALL_BOX = {
	totalBytes: 7746 * MIB,
	availableBytes: 6316 * MIB,
	swapTotalBytes: 0,
	sessionLimits: true
};

describe('usableBytes', () => {
	it('keeps the reserve back and counts swap at half', () => {
		expect(
			usableBytes({ ...SMALL_BOX, totalBytes: 8 * GIB, swapTotalBytes: 8 * GIB })
		).toBe(12 * GIB - RESERVED_BYTES);
	});
});

describe('admitBullet', () => {
	it('runs a verify bullet alone on a small box', () => {
		expect(admitBullet({ memory: SMALL_BOX, kind: 'verify', inFlight: [] })).toEqual({
			admitted: true,
			limitBytes: BULLET_BYTES.verify
		});
	});

	// The failure this exists for: a verify bullet started beside a build on an
	// 8 GB box, and the kernel killed the agent along with both of them.
	it('holds a verify bullet while a build is running on a small box', () => {
		expect(admitBullet({ memory: SMALL_BOX, kind: 'verify', inFlight: ['build'] })).toEqual({
			admitted: false
		});
	});

	it('fits two builds on a small box', () => {
		expect(admitBullet({ memory: SMALL_BOX, kind: 'build', inFlight: ['build'] })).toEqual({
			admitted: true,
			limitBytes: BULLET_BYTES.build
		});
	});

	it('runs a verify bullet beside a build once swap makes the room', () => {
		const withSwap = { ...SMALL_BOX, totalBytes: 8 * GIB, swapTotalBytes: 8 * GIB };

		expect(admitBullet({ memory: withSwap, kind: 'verify', inFlight: ['build'] }).admitted).toBe(
			true
		);
	});

	// Never running it would be a queue stuck for good on a machine that could have
	// done the work, slowly.
	it('runs a bullet bigger than the machine alone, under everything it has', () => {
		const tiny = { ...SMALL_BOX, totalBytes: 4 * GIB };

		expect(admitBullet({ memory: tiny, kind: 'verify', inFlight: [] })).toEqual({
			admitted: true,
			limitBytes: 4 * GIB - RESERVED_BYTES
		});
	});

	it('never limits a session below a gigabyte', () => {
		const tiny = { ...SMALL_BOX, totalBytes: 2 * GIB };

		expect(admitBullet({ memory: tiny, kind: 'build', inFlight: [] })).toEqual({
			admitted: true,
			limitBytes: GIB
		});
	});
});
