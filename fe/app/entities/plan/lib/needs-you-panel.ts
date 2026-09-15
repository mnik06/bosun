import type { BuildStatus, NeedsYouReason } from '../model/build'

interface Stoppable {
	status: BuildStatus
	needsYouReason: NeedsYouReason | null
}

// The header's needs-you panel is the one place a stopped build's reason is shown,
// with Retry and Cancel beside it. Every other surface that renders the reason asks
// this first, or the same failure appears twice on one screen.
export function showsNeedsYouPanel<T extends Stoppable> (
	build: T | null
): build is T & { status: 'needs_you', needsYouReason: Exclude<NeedsYouReason, 'overlap'> } {
	return build !== null && build.status === 'needs_you' && build.needsYouReason !== null && build.needsYouReason !== 'overlap'
}
