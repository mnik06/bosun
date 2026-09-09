const STORAGE_KEY = 'bosun.active-project-id'

// Which project every request is made in. It lives here rather than in the
// project slice because the two things that need it — the axios interceptor and
// the socket — are both in shared, and neither may import upwards.
let activeProjectId: string | null = readStored()

const listeners = new Set<() => void>()

function readStored (): string | null {
	try {
		return window.localStorage.getItem(STORAGE_KEY)
	} catch {
		return null
	}
}

export function getActiveProjectId (): string | null {
	return activeProjectId
}

export function setActiveProjectId (projectId: string | null): void {
	if (projectId === activeProjectId) {
		return
	}

	activeProjectId = projectId

	try {
		if (projectId === null) {
			window.localStorage.removeItem(STORAGE_KEY)
		} else {
			window.localStorage.setItem(STORAGE_KEY, projectId)
		}
	} catch {
		// A browser with storage blocked still switches project for this tab; only
		// the choice surviving a reload is lost.
	}

	for (const listener of listeners) {
		listener()
	}
}

export function subscribeToActiveProject (listener: () => void): () => void {
	listeners.add(listener)

	return () => {
		listeners.delete(listener)
	}
}
