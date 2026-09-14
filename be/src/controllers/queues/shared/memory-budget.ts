import { type SliceKind } from 'src/types/PlanSchema';
import { type MachineMemory } from 'src/types/machine-memory';

const GIB = 1024 ** 3;

// Kept back from every bullet: the kernel, the agent, a RAM-backed `/tmp`, and
// enough page cache that the box is not paging its own binaries. The agent falls
// back to the same number when a backend sends it no limit.
export const RESERVED_BYTES = 1.5 * GIB;

// Measured, not guessed. On an 8 GB box a whole-package lint peaked at 2 GB, a
// typecheck at 1.1 GB and a dev server at 0.8 GB, and a verify bullet running
// them beside its own stack reached 6.3 GB before the kernel killed it. A build
// bullet runs the same loop but never starts a stack.
export const BULLET_BYTES: Record<SliceKind, number> = { build: 3 * GIB, verify: 6 * GIB };

// A limit below this is a session the kernel kills on its first real
// allocation, which reads as a bullet that cannot start rather than a machine
// that is too small.
const FLOOR_BYTES = GIB;

// Swap counts for half: it turns a spike into a slowdown instead of a kill, but a
// bullet that lives in it crawls, so it is not budgeted as though it were RAM.
export function usableBytes(memory: MachineMemory): number {
	return Math.max(
		0,
		memory.totalBytes + Math.floor(memory.swapTotalBytes / 2) - RESERVED_BYTES
	);
}

// Never more than the machine can give. A box smaller than a verify bullet still
// runs one — alone, under everything it has — rather than never running it.
export function bulletBytes(opts: { kind: SliceKind; usable: number }): number {
	return Math.max(FLOOR_BYTES, Math.min(BULLET_BYTES[opts.kind], opts.usable));
}

export type Admission = { admitted: true; limitBytes: number } | { admitted: false };

// The limit handed to a bullet is the same number it was admitted with, so the
// limits of everything running never add up to more than the machine has. That
// is what keeps the kernel's own out-of-memory killer — which picks from the
// whole box, agent included — from ever being the one that acts.
//
// Two advances racing on one machine can each see the other's bullet missing and
// both admit. The scopes still hold each bullet to its limit; what is lost in
// that window is only the guarantee that the limits fit together.
export function admitBullet(opts: {
	memory: MachineMemory;
	kind: SliceKind;
	inFlight: SliceKind[];
}): Admission {
	const usable = usableBytes(opts.memory);
	const limitBytes = bulletBytes({ kind: opts.kind, usable });
	const held = opts.inFlight.reduce((sum, kind) => sum + bulletBytes({ kind, usable }), 0);

	// A machine running nothing always takes the bullet: waiting for memory that
	// nothing is holding would be a queue stuck for good.
	if (opts.inFlight.length > 0 && held + limitBytes > usable) {
		return { admitted: false };
	}

	return { admitted: true, limitBytes };
}
